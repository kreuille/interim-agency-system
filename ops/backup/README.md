# `ops/backup/` — sauvegarde + restauration Postgres chiffrée

> Conformité : CLAUDE.md §3.4 (chiffrement au repos), nLPD (rétention 90 j max).
> SLA : RPO ≤ 15 min, RTO ≤ 4h. Démontré par `test-roundtrip.sh` mensuel.

## Vue d'ensemble

| Composant | Fichier | Rôle |
|---|---|---|
| Dump quotidien | `pg_dump.sh` | pg_dump format custom + chiffrement age + upload bucket |
| WAL archiving | `wal-archive.sh` | Appelé par Postgres `archive_command` toutes les 5 min |
| Restauration | `pg_restore.sh` | Download + sha256 verify + age decrypt + pg_restore |
| Test E2E | `test-roundtrip.sh` | Dump → restore vers cible DR + verify rowcounts |
| Worker mensuel | `apps/worker/src/dr-restore-test.worker.ts` | Wrapper BullMQ qui joue test-roundtrip.sh tous les 1ers du mois |
| Compose DR | `../docker-compose.dr-test.yml` | Postgres cible `_dr` sur port 5433 |
| Workflow CI | `.github/workflows/dr-roundtrip.yml` | Job mensuel + sur PR `ops/backup/*` (DETTE-037) |

## Préparation locale (1 fois)

### 1. Installer dépendances

```bash
# macOS
brew install age postgresql@16

# Linux (apt)
sudo apt install age postgresql-client-16
```

### 2. Générer une paire de clés age **pour les tests** (à ne PAS utiliser en prod)

```bash
mkdir -p ops/backup/test-keys
age-keygen -o ops/backup/test-keys/identity.txt
grep "^# public key:" ops/backup/test-keys/identity.txt | cut -d' ' -f4 > ops/backup/test-keys/recipient.txt
```

Le dossier `test-keys/` est dans `.gitignore` racine (à vérifier — sinon ajouter).

**En prod** : la paire de clés est générée par le DPO + lead tech, posée dans Secret Manager (Infomaniak / GCP) — JAMAIS dans le repo.

### 3. Démarrer Postgres source + DR

```bash
docker compose -f docker-compose.yml -f ops/docker-compose.dr-test.yml up -d postgres postgres-dr
```

Vérifier :
```bash
docker compose ps
# postgres        Up (healthy) 0.0.0.0:5432->5432/tcp
# postgres-dr     Up (healthy) 0.0.0.0:5433->5432/tcp
```

### 4. Seeder la base source avec données de test

```bash
pnpm -F @interim/api prisma:migrate:deploy
pnpm -F @interim/api prisma:seed
```

## Exécuter le test E2E

```bash
AGE_RECIPIENT=$(cat ops/backup/test-keys/recipient.txt) \
AGE_IDENTITY_FILE=ops/backup/test-keys/identity.txt \
./ops/backup/test-roundtrip.sh
```

Sortie attendue :
```
[1/6] mesurer rowcounts source ...
[2/6] pg_dump source
[pg_dump] start interim_dev@localhost:5432 ...
[pg_dump] OK — 12345 bytes
[age] OK — 8765 bytes
[sha256] abc123...
[upload] local cp → /tmp/...
[3/6] pg_restore vers interim_dr@localhost:5433
[restore] download /tmp/.../pgdump_interim_dev_...dump.age
[sha256] OK abc123...
[age] decrypt → /tmp/.../restore.dump
[pg_restore] drop+create interim_dr@localhost
[pg_restore] restore → interim_dr
[restore] OK en 12s
[4/6] mesurer rowcounts cible
[5/6] rowcounts OK
[6/6] OK

========================================================================
  ✅ DR roundtrip OK
  RTO empirique : 14s (budget 14400s)
  Rowcounts identiques : {"temp_workers":0,"mission_proposals":0,...}
========================================================================
{"event":"dr_roundtrip.completed","durationSeconds":14,"rtoBudgetSeconds":14400,"rowCounts":{...}}
```

Si la sortie se termine par `✅ DR roundtrip OK`, l'environnement est validé.

## Configuration prod (à appliquer après DETTE-015 — provisioning GCP)

### `pg_dump.sh` — cron Cloud Scheduler quotidien

Cloud Scheduler → Cloud Run job, exécuté à 02:00 UTC (04:00 Europe/Zurich, hors heures ouvrées) :

```yaml
# Cloud Scheduler job (terraform / gcloud)
schedule: "0 2 * * *"  # 02:00 UTC quotidien
time_zone: "UTC"
target:
  type: HTTP
  uri: https://api.interim.ch/internal/jobs/pg-dump  # endpoint protégé OIDC
  http_method: POST
```

Variables Cloud Run :
```
PG_HOST=10.x.x.x  (Cloud SQL private IP)
PG_USER=interim_backup  (rôle dédié, droits SELECT only)
PG_DB=interim_prod
PGPASSWORD=$(gcloud secrets versions access latest --secret=pg-backup-pwd)
AGE_RECIPIENT=$(gcloud secrets versions access latest --secret=age-recipient)
BACKUP_DEST=gs://interim-prod-backups/
```

### `wal-archive.sh` — `archive_command` Postgres

Dans `postgresql.conf` (Cloud SQL flag) :
```
wal_level = replica
archive_mode = on
archive_command = '/etc/postgres/wal-archive.sh %p %f'
archive_timeout = 300  # force WAL switch toutes les 5 min même si pas plein
```

Le script doit être déployé sur le node Postgres via Cloud SQL extension (ou via Cloud Functions sidecar — voir DETTE-015).

### Lifecycle bucket GCS

```yaml
# gsutil lifecycle set
{
  "rule": [
    { "action": {"type": "Delete"}, "condition": {"age": 90, "matchesPrefix": ["pgdump_"]} },
    { "action": {"type": "Delete"}, "condition": {"age": 30, "matchesPrefix": ["wal-"]} }
  ]
}
```

90 jours dumps quotidiens, 30 jours WAL. Au-delà : conformité nLPD (pas plus que nécessaire à la finalité).

## CI : workflow `dr-roundtrip.yml` (DETTE-037)

Le test E2E tourne automatiquement dans GitHub Actions :

| Trigger | Quand |
|---|---|
| `schedule` cron `0 3 1 * *` | 1er du mois à 03h00 UTC (= 04h-05h Europe/Zurich) |
| `pull_request` paths-filter | Toute PR qui touche `ops/backup/**`, `ops/docker-compose.dr-test.yml`, `docker-compose.yml` ou le workflow lui-même |
| `workflow_dispatch` | Déclenchement manuel (gameday, debug). Inputs : `rto_budget_seconds`, `seed_rows_per_table` |

Étapes du job (~5 min) :

1. Install `age` + `postgresql-client-16` via apt-get
2. Génère une paire de clés age **éphémère** dans `ops/backup/test-keys/` (jetée à la fin du job, jamais committée — `.gitignore` couvre déjà ce dossier)
3. `docker compose up -d postgres postgres-dr` (avec override `dr-test.yml`)
4. Wait healthy (timeout 60s)
5. Seed source DB avec `SEED_ROWS=500` rows × 4 tables critiques (`temp_workers`, `mission_proposals`, `timesheets`, `audit_logs`)
6. **Exécute `bash ops/backup/test-roundtrip.sh`** avec env `AGE_*` + `PG_*`
7. Sur succès : log RTO empirique. Sur échec : upload artifact (recipient public uniquement, JAMAIS la clé privée), dump container logs, exit 1
8. Cleanup containers + clés éphémères (`if: always()`)

**Garde-fou** : timeout 30 min global. Si le job dépasse, c'est un blocage docker/network suspect (le test local prend < 5 min). Fail-fast.

**Concurrence** : `cancel-in-progress: false` sur le cron mensuel — on ne tue jamais un test DR en cours, même si une PR concurrent push.

### Quoi faire si le job CI échoue

1. **Lire les logs** : artifact `dr-roundtrip-failure-<run-id>` + step "Dump container logs on failure"
2. **Reproduire localement** : `cd ops && docker compose -f ../docker-compose.yml -f docker-compose.dr-test.yml up -d` puis `bash ops/backup/test-roundtrip.sh`
3. **Causes courantes** :
   - `age` non installé sur le runner → vérifier la step `Install age`
   - Postgres pas healthy après 60s → augmenter `for i in $(seq 1 60)` dans `Wait for Postgres healthy`
   - `pg_restore` échoue avec `extension uuid-ossp` manquante → ajouter `CREATE EXTENSION` dans le seed (à wire si on commence à utiliser `uuid_generate_v4()` côté app)
   - Rowcounts divergents → script `pg_dump.sh` ou `pg_restore.sh` cassé. Reproduire local + bisect
4. **Si non-régression confirmée mais flake** : ouvrir un ticket DETTE pour stabiliser (timeout réseau Docker Hub, etc.)

## Métriques exportées (Prometheus)

Le worker `dr-restore-test.worker.ts` publie via callback `onResult` :
- `dr_restore_duration_seconds` (gauge) — durée du dernier roundtrip
- `dr_restore_rto_breaches_total` (counter) — nb fois RTO 4h dépassé
- `dr_restore_failures_total` (counter) — nb échecs script (exit ≠ 0)

À wire dans `apps/worker/main.ts` au moment où le worker DR sera ajouté
au runtime (DETTE-033 incluse).

## Alertes Prometheus

Voir `ops/prometheus/rules/alerts-p1.yml` (ajout en suite via cette PR) :

```yaml
- alert: PgDumpStale
  expr: time() - pg_dump_last_success_timestamp > 90000  # 25h
  for: 5m
  labels: { severity: P1 }
  annotations:
    summary: "Aucun pg_dump réussi depuis > 25h"
    runbook: "docs/runbooks/disaster-recovery.md §1 Préconditions"

- alert: DrRoundtripFailed
  expr: increase(dr_restore_failures_total[35d]) > 0
  labels: { severity: P1 }
  annotations:
    summary: "Le test DR mensuel a échoué"
    runbook: "docs/runbooks/disaster-recovery.md §3"
```

## Sécurité — points critiques

1. **Clé age publique** (`AGE_RECIPIENT`) peut être déployée largement (env Cloud Run, repos publics OK : c'est la clé publique).
2. **Clé age privée** (`AGE_IDENTITY_FILE`) est **scopée DR uniquement** :
   - Stockée dans Secret Manager
   - Accessible UNIQUEMENT par le compte service du worker DR
   - JAMAIS sur l'instance Postgres prod (pour qu'un compromis de la prod ne donne pas accès aux backups)
3. **Suffixe `_dr` obligatoire** sur la cible (script `pg_restore.sh` § guard) — anti-fat-finger qui détruirait la prod par erreur.
4. **Vérification sha256** avant déchiffrement — protège contre bit rot bucket et tampering bucket.
5. **Rotation des clés age** : tous les 6 mois minimum. Procédure :
   - Générer nouvelle paire
   - Pousser nouvelle publique en prod (les nouveaux dumps sont chiffrés avec la nouvelle clé)
   - Garder l'ancienne identity en Secret Manager (versions précédentes accessibles 1 an)
   - Le restore peut tenter plusieurs identities (`age -i key1 -i key2 ...`)
6. **Audit log** chaque restore prod dans `audit_logs` table avec `actor=system_dr`, `actor_ip`, `dump_source` — conformité nLPD obligation 10 ans.

## Références

- Runbook complet : `docs/runbooks/disaster-recovery.md`
- Skill : `skills/dev/devops-swiss/SKILL.md` § Backup Postgres
- age encryption : https://age-encryption.org/v1
- Postgres PITR docs : https://www.postgresql.org/docs/16/continuous-archiving.html
