# Runbook — Disaster Recovery (PG restore depuis backup chiffré)

> **Sévérité déclencheuse** : P1 — perte ou corruption de la base prod
> **Audience** : on-call + lead tech + DPO (notification post-restore obligatoire nLPD)
> **SLA cible** : RPO ≤ 15 min, RTO ≤ 4h
> **Dernière révision gameday** : à valider mensuellement via `dr-restore-test` (job worker)

---

## 0. Quand utiliser ce runbook

- 🔴 Postgres prod inaccessible > 10 min ET indisponibilité confirmée hors backup app (DB volume corrompu, panne hardware, suppression accidentelle de données)
- 🔴 Suppression cross-tenant détectée — restore PITR vers point antérieur
- 🟡 Test mensuel automatique (`dr-restore-test.worker.ts`) — workflow identique mais sur DB cible `_dr` séparée

**NE PAS utiliser ce runbook pour** :
- Bug applicatif → rollback image API (procédure `release-management/SKILL.md`)
- Lenteur DB → vérifier dashboards Grafana `api-health` p95 + locks
- Perte d'1 ligne ponctuelle → restaurer ce dump dans DB temporaire `_test_<ts>`, copier la ligne, propager via UPDATE — pas un DR

---

## 1. Préconditions (doivent être satisfaites en prod)

Vérifications mensuelles dans le runbook `OPS.weekly-review.md` :

- [ ] **Backup quotidien** présent dans `gs://interim-prod-backups/` avec préfixe `pgdump_interim_prod_<ts>.dump.age` (≥ 7 dumps des 7 derniers jours)
- [ ] **WAL archiving** actif : objets `gs://interim-prod-wal/<wal-name>.age` créés en continu (≥ 1 toutes les 5 min)
- [ ] **Clé age publique** déployée sur l'instance Postgres (`AGE_RECIPIENT` env)
- [ ] **Clé age privée** dans Secret Manager (`AGE_IDENTITY_FILE` accessible au compte service Cloud Run du worker DR uniquement)
- [ ] **Test mensuel `dr-restore-test`** vert dans la dernière exécution (cron le 1er du mois)

---

## 2. Architecture backup — résumé

```
                      ┌──────────────────────────────┐
                      │  Cloud SQL Postgres prod     │
                      │  europe-west6                │
                      │                              │
  WAL archive_command │  archive_command="wal-archive│
  (toutes les 5 min)  │   .sh %p %f"                 │
         │            │                              │
         │            │  pg_dump quotidien           │
         │            │  cron 02:00 UTC              │
         │            └──────────────┬───────────────┘
         │                           │
         ▼                           ▼
  ┌──────────────┐           ┌──────────────────┐
  │ gs://prod-wal│           │ gs://prod-backups│
  │ chiffré age  │           │ chiffré age      │
  │ rétention 30j│           │ rétention 90j    │
  └──────┬───────┘           └────────┬─────────┘
         │                            │
         │  RPO 15 min                │  RTO 4h
         └────────────┬───────────────┘
                      ▼
            ┌────────────────────┐
            │ pg_restore.sh      │
            │ + recovery.conf    │
            │ → DB cible *_dr    │
            └────────────────────┘
```

**Décisions figées** :
- **age** (https://age-encryption.org) plutôt que GPG : clés courtes, format simple, audit code minimal. Recipient public déployé largement, identity privée scopée DR uniquement.
- **format custom** (`pg_dump -Fc`) plutôt que SQL plain : plus rapide, parallélisable au restore (`-j 4`), compression incluse.
- **suffixe `_dr` obligatoire** sur la base cible : guard du script `pg_restore.sh` refuse de drop une base sans ce suffixe (anti-fat-finger qui détruirait la prod).
- **Rétention** : 90 jours dumps quotidiens (politique nLPD : pas plus que nécessaire) ; 30 jours WAL pour PITR rétroactif.

---

## 3. Procédure DR — restore complet (perte totale)

### 3.1 Stop the bleeding (5 min)

1. **Déclarer l'incident P1** dans Slack `#incidents` :
   ```
   🔴 P1 — DR engagement
   - Cause : <perte data prod / corruption / suppression>
   - DRI : <on-call>
   - Status page : interim.ch/status — set to "DB unavailable, restore in progress"
   ```
2. **Mettre l'API en mode read-only** (feature flag `READ_ONLY_MODE=true` via Cloud Run env update). Sans ça, les requêtes de mutation génèrent du WAL qu'on ne pourra pas réconcilier après restore.
3. **Bloquer les workers BullMQ** : `pnpm -F @interim/worker dev:stop` ou `kubectl scale deployment worker --replicas=0`. Évite de drainer la queue contre une DB en cours de restore.

### 3.2 Identifier le point de restore (5 min)

Quel est le dernier état "sain" connu ?

```bash
# Lister les backups disponibles
gsutil ls -l gs://interim-prod-backups/ | tail -20

# Lister les WAL récents (pour PITR fin)
gsutil ls -l gs://interim-prod-wal/ | tail -50
```

Choisir :
- **Restore simple** (perte < 24h tolérable) : dernier dump quotidien, suffit
- **PITR** (perte critique, besoin point précis) : dernier dump + WAL jusqu'à T-désiré

### 3.3 Provisionner instance Postgres cible (10 min)

```bash
# En prod GCP : créer une instance Cloud SQL temporaire OU réutiliser
# l'instance prod après l'avoir vidée (si elle est récupérable)
gcloud sql instances create interim-dr-$(date +%s) \
  --database-version=POSTGRES_16 \
  --region=europe-west6 \
  --tier=db-custom-2-8192 \
  --storage-size=100GB \
  --storage-type=SSD

# Récupérer le password admin via Secret Manager
DR_HOST=$(gcloud sql instances describe interim-dr-... --format='value(ipAddresses[0].ipAddress)')
```

**En local (test)** : `docker compose -f ops/docker-compose.dr-test.yml up -d postgres-dr` (port 5433).

### 3.4 Restore depuis dump (15 min ⇒ RTO majeur)

```bash
PG_HOST=${DR_HOST} \
PG_USER=postgres \
PGPASSWORD=$(gcloud secrets versions access latest --secret=postgres-dr-pwd) \
PG_DB=interim_dr \
BACKUP_SRC=gs://interim-prod-backups/pgdump_interim_prod_20260423T020000Z.dump.age \
AGE_IDENTITY_FILE=/secrets/age-identity.txt \
./ops/backup/pg_restore.sh
```

Sortie attendue :
```
[restore] download gs://...
[sha256] OK abc123...
[age] decrypt → /tmp/.../restore.dump
[pg_restore] drop+create interim_dr@<host>
[pg_restore] restore → interim_dr
[restore] OK en 847s
{"event":"pg_restore.completed","db":"interim_dr","durationSeconds":847,...}
```

### 3.5 PITR (optionnel, +30 min) — replay WAL jusqu'à T-précis

Si on doit récupérer jusqu'à 5 min avant la corruption :

1. Dans le `postgresql.conf` de l'instance DR, ajouter :
   ```
   restore_command = 'gsutil cp gs://interim-prod-wal/%f.age /tmp/%f.age && age --decrypt -i /secrets/age-identity.txt -o %p /tmp/%f.age'
   recovery_target_time = '2026-04-23 14:35:00+02'
   ```
2. Redémarrer Postgres en mode recovery :
   ```bash
   touch /var/lib/postgresql/data/recovery.signal
   gcloud sql instances restart interim-dr-...
   ```
3. Postgres rejoue les WAL jusqu'au timestamp cible, puis sort de recovery.

### 3.6 Vérifier intégrité (10 min)

```sql
-- Rowcounts par table critique
SELECT 'temp_workers' AS t, count(*) FROM temp_workers
UNION ALL SELECT 'mission_proposals', count(*) FROM mission_proposals
UNION ALL SELECT 'timesheets', count(*) FROM timesheets
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs;

-- Hash chain audit_logs intact (DETTE A1.6 : hash sha256 chaîné)
SELECT count(*) AS broken_chain
FROM audit_logs a1
JOIN audit_logs a2 ON a2.id = a1.next_id
WHERE a2.previous_hash != a1.hash;
-- → doit retourner 0
```

Comparer aux derniers rowcounts connus (Grafana dashboard `payroll-batch` historique 7 jours).

### 3.7 Bascule (15 min) — RTO terminal

1. **Mettre à jour le DNS / Cloud SQL alias** pour pointer la prod vers la nouvelle instance DR :
   ```bash
   gcloud sql instances patch interim-prod \
     --backup-location=europe-west6 \
     --root-password=$(...)
   # OU si on garde un DNS interne : update Cloud DNS A record
   ```
2. **Mettre à jour `DATABASE_URL`** dans Secret Manager (Cloud Run lit la version `latest` au prochain démarrage)
3. **Redéployer l'API** (Cloud Run revision rollout) pour que la nouvelle config prenne effet :
   ```bash
   gcloud run deploy interim-api --image=... --region=europe-west6
   ```
4. **Sortir du mode read-only** : `READ_ONLY_MODE=false` puis re-deploy
5. **Relancer les workers** : scale up à la valeur normale
6. **Vérifier** : dashboards Grafana `api-health` montrent rate > 0 et 5xx = 0 ; tester un endpoint :
   ```bash
   curl https://api.interim.ch/health
   # → {"status":"ok","version":"..."}
   ```
7. **Communiquer fin d'incident** Slack + status page

### 3.8 Postmortem (J+5)

Template `docs/incidents/YYYY-MM-DD-dr-event.md` (cf. `skills/ops/release-management/SKILL.md`).

---

## 4. Procédure DR — test mensuel automatisé

Le worker `dr-restore-test.worker.ts` exécute :

1. Pull du dernier dump prod
2. Restore vers une instance DR jetable (Cloud SQL DB `interim_dr_test`)
3. Vérifie rowcounts (cohérence vs API live counts via `/metrics`)
4. Mesure durée totale → push métrique `dr_restore_duration_seconds`
5. Échoue si :
   - Durée > 4h (alerte P2)
   - Rowcounts divergent > 5% (alerte P1 — corruption probable)
   - SHA256 mismatch (alerte P1 — bit rot bucket)

Cron : 1er du mois 03:00 UTC. Résultats dans dashboard Grafana `dr-test` (à créer dans `ops/grafana/dashboards/`).

**En local (CI smoke ou validation gameday)** :
```bash
docker compose -f docker-compose.yml up -d postgres
docker compose -f ops/docker-compose.dr-test.yml up -d postgres-dr
PGPASSWORD=dev psql -h localhost -U dev -d interim_dev -c "INSERT INTO temp_workers (...) VALUES (...)"
AGE_RECIPIENT=$(cat ops/backup/test-keys/recipient.txt) \
AGE_IDENTITY_FILE=ops/backup/test-keys/identity.txt \
./ops/backup/test-roundtrip.sh
```

---

## 5. Erreurs courantes & solutions

| Erreur | Cause probable | Action |
|---|---|---|
| `[sha256] MISMATCH` | Bit rot bucket OU tampering | Tenter dump précédent ; alerter sécurité |
| `[age] FAILED — clé identity invalide` | Wrong key file, ou key rotation non synchro | Vérifier Secret Manager version `latest` ; revenir à version précédente si rotation récente |
| `pg_restore: error: could not create extension "..."` | Extensions manquantes sur instance DR | `psql -c "CREATE EXTENSION ..."` puis relancer |
| `[guard] PG_DB=... refus` | Cible sans suffixe `_dr` | **C'est normal — protection anti-fat-finger.** Renommer cible. |
| `recovery_target_time` non atteint | WAL gap (archive a manqué un fichier) | Choisir `recovery_target_time` antérieur OU restaurer dump du jour |

---

## 6. Métriques de santé DR (Grafana)

À surveiller en continu (alertes Prometheus configurées) :
- `pg_dump_last_success_timestamp` — alerte P1 si > 25h
- `pg_dump_size_bytes` — alerte P3 si chute > 50% jour-à-jour (signal de mauvais dump)
- `wal_archive_failures_total` — alerte P2 si > 5 sur 1h (impact PITR)
- `dr_restore_duration_seconds` (test mensuel) — alerte P2 si > 4h
- `dr_restore_rowcount_divergence_pct` — alerte P1 si > 5%

Ces métriques sont exposées par les jobs eux-mêmes (logs JSON Promtail-parsés vers Loki, puis recording rules Prometheus). Voir `ops/grafana/dashboards/` pour le dashboard dédié `dr-test.json` (à créer en suite — DETTE-037).

---

## 7. Validation CI automatique (DETTE-037)

Le workflow `.github/workflows/dr-roundtrip.yml` joue automatiquement la procédure DR (sections 3 et 4) en mode jouet :

| Trigger | Quand | Pourquoi |
|---|---|---|
| `schedule` cron `0 3 1 * *` | 1er du mois 03h00 UTC | Gameday minimal — détecte les régressions silencieuses (rotation deps Ubuntu, `age` cassé, image Postgres modifiée) |
| `pull_request` paths-filter | Toute PR qui touche `ops/backup/**`, `ops/docker-compose.dr-test.yml`, `docker-compose.yml` ou le workflow | Bloque dès la PR un changement qui casserait le restore |
| `workflow_dispatch` | Manuel — gameday ad-hoc, debug | Inputs : `rto_budget_seconds`, `rpo_budget_seconds`, `seed_rows_per_table` |

### 7.1 Enchaînement des steps

1. **`shellcheck`** (job séparé, gate du job principal) : lint des scripts `ops/backup/*.sh` via `ludeeus/action-shellcheck`. Sévérité `warning`. Si fail → tout le workflow s'arrête.
2. **Install `age` + `postgresql-client-16`** sur le runner Ubuntu 24.04
3. **Génère paire de clés age éphémère** dans `ops/backup/test-keys/` (jetée à la fin, jamais committée — `.gitignore` couvre)
4. **`docker compose up`** Postgres source (port 5432) + DR (port 5433) avec override `dr-test.yml`
5. **Wait healthy** (30 tentatives × 2s = 60s max — sinon dump container logs et exit 1)
6. **Seed source DB** : `SEED_ROWS=500` rows × 4 tables critiques (`temp_workers`, `mission_proposals`, `timesheets`, `audit_logs`)
7. **`pg_dump.sh` standalone** : produit un dump dans `/tmp/dr-asserts/` pour les asserts ci-dessous
8. **`assert_sha256`** : recalcule sha256 du `.dump.age` et compare au `.sha256` produit par `pg_dump.sh`. Détecte une régression où `pg_dump.sh` produirait un sha256 incohérent.
9. **`assert_age_header`** : vérifie que les 22 premiers octets du dump sont `age-encryption.org/v1`. **Garde-fou P1** contre une régression où `pg_dump.sh` oublierait l'étape de chiffrement (data leak en prod).
10. **`assert_rpo`** : vérifie `dump_duration ≤ RPO_BUDGET_SECONDS` (default 900s = 15 min). Sur le seed CI minimal, doit être de l'ordre de 1-3s. Si > 15 min → soit pg_dump est cassé, soit le runner est saturé.
11. **`test-roundtrip.sh`** : enchaîne dump → restore → compare rowcounts source/cible
12. **`assert_rto`** : vérifie `roundtrip_duration ≤ RTO_BUDGET_SECONDS` (default 14400s = 4h). Sur le seed CI minimal, doit être de l'ordre de 10-30s.

### 7.2 Format des logs en CI

Les scripts `_lib.sh`-aware détectent `env CI=true` et basculent sur **JSON Lines** :

```
{"ts":"2026-04-23T12:34:56.789Z","level":"info","script":"pg_dump.sh","msg":"pg_dump start","ctx":{"db":"interim_dev","host":"localhost","port":5432}}
{"ts":"2026-04-23T12:34:57.012Z","level":"info","script":"pg_dump.sh","msg":"pg_dump ok","ctx":{"db":"interim_dev","sizeBytes":12345}}
```

En local (sans `CI=true`), les logs restent en format `[script] message` human-readable.

Cela permet à Promtail (en prod, hors CI) ou à des jobs CI downstream de parser les logs sans regex fragile.

### 7.3 Exit codes normalisés

Tous les scripts `ops/backup/*.sh` partagent les codes définis dans `_lib.sh` :

| Code | Constante | Sens |
|---|---|---|
| 0 | `EXIT_OK` | succès |
| 1 | `EXIT_DUMP_FAIL` | `pg_dump` a échoué |
| 2 | `EXIT_AGE_FAIL` | encrypt OU decrypt age a échoué (clé invalide, header invalide) |
| 3 | `EXIT_SHA256_FAIL` | sha256 mismatch OU download source impossible |
| 4 | `EXIT_RESTORE_FAIL` | `pg_restore` a échoué OU upload bucket a échoué (overlap acceptable) |
| 5 | `EXIT_ROWCOUNT_MISMATCH` | rowcounts source ≠ cible (corruption silencieuse) — uniquement émis par `test-roundtrip.sh` |
| 6 | `EXIT_RTO_EXCEEDED` | `RTO_BUDGET_SECONDS` dépassé — uniquement émis par `test-roundtrip.sh` |

Un on-call qui voit `exit 5` dans les logs Loki sait qu'il s'agit d'une **divergence rowcount** — pas besoin d'aller lire la stdout pour diagnostiquer.

### 7.4 Artifacts en cas d'échec

Si l'un des steps échoue, le step `Collect failure artifacts` collecte automatiquement :

- `compose-ps.txt` — état des containers
- `postgres-src.log` — 500 dernières lignes Postgres source
- `postgres-dr.log` — 500 dernières lignes Postgres DR
- `pg-stat-src.txt` — top 20 requêtes lentes (`pg_stat_statements` si activé)
- `rowcounts-src.txt`, `rowcounts-dr.txt` — counts par table critique
- Le dump produit (≤ 50 MB) — pour rejeu local
- `roundtrip.out` — stdout complet du test
- `age-recipient-public.txt` — clé publique éphémère (la privée n'est **jamais** uploadée)

Téléchargeables 7 jours dans l'onglet "Artifacts" du run GitHub Actions.

### 7.5 Quoi faire si le job CI échoue

1. **Lire les logs** dans l'onglet Actions + télécharger `dr-roundtrip-failure-<run-id>`
2. **Identifier l'exit code** dans les logs (ex: `exit 3` = sha256 mismatch)
3. **Reproduire localement** :
   ```bash
   docker compose -f docker-compose.yml -f ops/docker-compose.dr-test.yml up -d postgres postgres-dr
   age-keygen -o ops/backup/test-keys/identity.txt
   grep '^# public key:' ops/backup/test-keys/identity.txt | cut -d' ' -f4 > ops/backup/test-keys/recipient.txt
   AGE_RECIPIENT=$(cat ops/backup/test-keys/recipient.txt) \
   AGE_IDENTITY_FILE=ops/backup/test-keys/identity.txt \
   bash ops/backup/test-roundtrip.sh
   ```
4. **Causes courantes** :
   - `assert_age_header` fail → régression dans `pg_dump.sh` qui oublie le step `age --encrypt` (P1, data leak prod)
   - `assert_sha256` fail → régression dans `pg_dump.sh` qui produit un `.sha256` incohérent (corruption silencieuse possible)
   - `assert_rpo` > 900s → pg_dump trop lent (image Docker saturée, seed trop gros, perf Postgres dégradée)
   - `assert_rto` > 14400s → soit le seed est anormalement gros, soit pg_restore est cassé
   - exit 5 (rowcount mismatch) → corruption pendant le roundtrip — **inspecter `_dr` rapidement**
5. **Si flake confirmé** : ouvrir un ticket DETTE pour stabiliser (ex: timeout réseau Docker Hub)

### 7.6 Test régression intentionnel (gameday checklist)

Périodiquement (1× par trimestre minimum), valider que le workflow détecte bien les régressions critiques :

| Test | Modification | Résultat attendu |
|---|---|---|
| Sha256 désynchronisé | Modifier `pg_dump.sh` pour écrire un sha256 random au lieu du vrai | `assert_sha256` doit fail → workflow rouge |
| Plain text au lieu d'age | Modifier `pg_dump.sh` pour skipper `age --encrypt` (cp direct) | `assert_age_header` doit fail → workflow rouge |
| RPO budget violé | `workflow_dispatch` avec `rpo_budget_seconds=1` | `assert_rpo` doit fail → workflow rouge |
| Rowcount mismatch | Modifier `pg_restore.sh` pour skipper une table | exit 5 → `test-roundtrip.sh` fail → workflow rouge |

**Toujours** revert ces modifs avant de merger. Cf. PR #82 pour le run de référence du test régression sha256.

---

## 8. Références

- `skills/dev/devops-swiss/SKILL.md` § Backup Postgres
- `skills/ops/release-management/SKILL.md` § Gestion d'incident
- `ops/backup/README.md` — détails opérationnels scripts
- `ops/backup/_lib.sh` — helpers communs (log_msg, exit codes)
- `.github/workflows/dr-roundtrip.yml` — workflow CI complet
- Postgres docs : https://www.postgresql.org/docs/16/continuous-archiving.html
- age encryption : https://age-encryption.org
