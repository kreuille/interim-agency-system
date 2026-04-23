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

## 7. Références

- `skills/dev/devops-swiss/SKILL.md` § Backup Postgres
- `skills/ops/release-management/SKILL.md` § Gestion d'incident
- `ops/backup/README.md` — détails opérationnels scripts
- Postgres docs : https://www.postgresql.org/docs/16/continuous-archiving.html
- age encryption : https://age-encryption.org
