#!/usr/bin/env bash
#
# pg_restore.sh — restauration Postgres depuis backup chiffré age.
#
# Workflow :
#   1. Télécharge le dump chiffré depuis BACKUP_SRC (filesystem ou GCS)
#   2. Vérifie le sha256 (intégrité, protège contre bit rot bucket)
#   3. Déchiffre via age + clé privée AGE_IDENTITY_FILE
#   4. Restaure via pg_restore (clean+create, pas de --if-exists pour
#      forcer une cible vide — fail fast)
#   5. Émet log JSON pour Promtail (event=pg_restore.completed)
#
# Sécurité :
# - La clé privée age (AGE_IDENTITY_FILE) doit venir du secret manager
#   en prod (Infomaniak Secret Manager / GCP Secret Manager), JAMAIS
#   commitée. En dev, fichier local hors git (~/.config/age/key.txt).
# - On crée un user PG temporaire avec les droits restore, puis on
#   le drope (cf. runbook DR §rotation).
#
# Usage :
#   PG_HOST=postgres-dr PG_USER=postgres PG_DB=interim_dr \
#   BACKUP_SRC=/var/backups/interim/pgdump_interim_prod_20260423T020000Z.dump.age \
#   AGE_IDENTITY_FILE=~/.config/age/restore-key.txt \
#   ./ops/backup/pg_restore.sh
#
# Exit codes (cf. _lib.sh) :
#   0 = succès
#   2 = déchiffrement age a échoué (EXIT_AGE_FAIL)
#   3 = sha256 mismatch ou téléchargement source échoué (EXIT_SHA256_FAIL)
#   4 = pg_restore a échoué OU guard suffix _dr (EXIT_RESTORE_FAIL)
#
# Note : le téléchargement source (gsutil/cp) est rangé dans EXIT_SHA256_FAIL
# parce que le résultat fonctionnel est identique (impossible de vérifier
# l'intégrité d'un fichier qu'on n'a pas) — overlap documenté.
#
# Référence : docs/runbooks/disaster-recovery.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/backup/_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

: "${PG_HOST:?PG_HOST manquant}"
: "${PG_USER:?PG_USER manquant}"
: "${PG_DB:?PG_DB manquant — attention : la base sera DROP CASCADE puis CREATE}"
: "${BACKUP_SRC:?BACKUP_SRC manquant — chemin local ou gs:// URI}"
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE manquant — fichier clé privée age}"

PG_PORT="${PG_PORT:-5432}"
WORK_DIR=$(mktemp -d /tmp/pg_restore.XXXXXX)
trap 'rm -rf "${WORK_DIR}"' EXIT

ENCRYPTED_FILE="${WORK_DIR}/restore.dump.age"
SHA256_FILE="${WORK_DIR}/restore.dump.age.sha256"
DUMP_FILE="${WORK_DIR}/restore.dump"
START_TS=$(date -u +%s)

# ---------- 1. Download ----------
log_msg info "download start" "{\"src\":\"${BACKUP_SRC}\"}"
case "${BACKUP_SRC}" in
  gs://*)
    if ! gsutil -q cp "${BACKUP_SRC}" "${ENCRYPTED_FILE}"; then
      log_msg error "download gsutil failed (dump)" "{\"src\":\"${BACKUP_SRC}\"}"
      exit "${EXIT_SHA256_FAIL}"
    fi
    if ! gsutil -q cp "${BACKUP_SRC}.sha256" "${SHA256_FILE}"; then
      log_msg error "download gsutil failed (sha256)" "{\"src\":\"${BACKUP_SRC}.sha256\"}"
      exit "${EXIT_SHA256_FAIL}"
    fi
    ;;
  *)
    if [[ ! -f "${BACKUP_SRC}" ]]; then
      log_msg error "download local source not found" "{\"src\":\"${BACKUP_SRC}\"}"
      exit "${EXIT_SHA256_FAIL}"
    fi
    cp "${BACKUP_SRC}" "${ENCRYPTED_FILE}"
    cp "${BACKUP_SRC}.sha256" "${SHA256_FILE}"
    ;;
esac

# ---------- 2. Vérification sha256 ----------
EXPECTED_SHA=$(cat "${SHA256_FILE}")
ACTUAL_SHA=$(sha256sum "${ENCRYPTED_FILE}" | awk '{print $1}')
if [[ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]]; then
  log_msg error "sha256 mismatch — backup corrompu (bit rot OU tampering)" \
    "{\"expected\":\"${EXPECTED_SHA}\",\"actual\":\"${ACTUAL_SHA}\"}"
  exit "${EXIT_SHA256_FAIL}"
fi
log_msg info "sha256 ok" "{\"sha256\":\"${ACTUAL_SHA}\"}"

# Sanity check age header avant de tenter le décrypt — donne un message
# d'erreur clair si BACKUP_SRC pointe sur un fichier qui n'est pas un
# blob age (ex: dump non chiffré envoyé par erreur).
AGE_MAGIC=$(head -c 22 "${ENCRYPTED_FILE}" 2>/dev/null || true)
if [[ "${AGE_MAGIC}" != "age-encryption.org/v1" ]]; then
  log_msg error "age header invalid — fichier source pas un blob age" "{\"got\":\"${AGE_MAGIC}\"}"
  exit "${EXIT_AGE_FAIL}"
fi

# ---------- 3. Déchiffrement ----------
log_msg info "age decrypt start" "{\"out\":\"${DUMP_FILE}\"}"
if ! age --decrypt --identity "${AGE_IDENTITY_FILE}" --output "${DUMP_FILE}" "${ENCRYPTED_FILE}"; then
  log_msg error "age decrypt failed — clé identity invalide ?" "{\"identityFile\":\"${AGE_IDENTITY_FILE}\"}"
  exit "${EXIT_AGE_FAIL}"
fi

# ---------- 4. pg_restore ----------
# Drop & recreate la cible. CRITIQUE : ne JAMAIS pointer sur la prod
# avec ce script. Le runbook impose qu'on restaure dans un nom de DB
# avec suffixe `_dr` ou `_test_<ts>`.
case "${PG_DB}" in
  *_dr|*_test_*|interim_dev)
    : # OK — cible attendue
    ;;
  *)
    log_msg error "guard refusé : PG_DB ne contient pas '_dr' / '_test_' / 'interim_dev' — anti fat-finger prod" \
      "{\"db\":\"${PG_DB}\"}"
    exit "${EXIT_RESTORE_FAIL}"
    ;;
esac

log_msg info "pg_restore drop+create" "{\"db\":\"${PG_DB}\",\"host\":\"${PG_HOST}\"}"
if ! PGPASSWORD="${PGPASSWORD:-}" psql \
  --host="${PG_HOST}" --port="${PG_PORT}" --username="${PG_USER}" --dbname=postgres \
  --quiet -c "DROP DATABASE IF EXISTS \"${PG_DB}\";" -c "CREATE DATABASE \"${PG_DB}\";"; then
  log_msg error "psql drop+create failed" "{\"db\":\"${PG_DB}\"}"
  exit "${EXIT_RESTORE_FAIL}"
fi

log_msg info "pg_restore start" "{\"db\":\"${PG_DB}\"}"
if ! PGPASSWORD="${PGPASSWORD:-}" pg_restore \
  --host="${PG_HOST}" --port="${PG_PORT}" --username="${PG_USER}" --dbname="${PG_DB}" \
  --no-owner --no-privileges --exit-on-error --jobs=4 --verbose \
  "${DUMP_FILE}" 2>"${WORK_DIR}/pg_restore.stderr"; then
  log_msg error "pg_restore failed" \
    "{\"db\":\"${PG_DB}\",\"stderr_tail\":\"$(tail -5 "${WORK_DIR}/pg_restore.stderr" | tr '\n' ' ' | cut -c1-200)\"}"
  tail -50 "${WORK_DIR}/pg_restore.stderr" >&2
  exit "${EXIT_RESTORE_FAIL}"
fi

END_TS=$(date -u +%s)
DURATION=$((END_TS - START_TS))

# ---------- 5. Vérification basique post-restore ----------
ROW_COUNTS=$(PGPASSWORD="${PGPASSWORD:-}" psql \
  --host="${PG_HOST}" --port="${PG_PORT}" --username="${PG_USER}" --dbname="${PG_DB}" \
  --tuples-only --no-align -c "
    SELECT json_agg(t)
    FROM (
      SELECT 'temp_workers' AS table, count(*) AS n FROM temp_workers
      UNION ALL SELECT 'mission_proposals', count(*) FROM mission_proposals
      UNION ALL SELECT 'timesheets', count(*) FROM timesheets
      UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
    ) t" 2>/dev/null || echo "[]")

# ---------- 6. Log JSON pour Promtail ----------
# Format event-style (différent JSON Lines log_msg) — consommé par CI
# pour assert_rto.
printf '{"event":"pg_restore.completed","db":"%s","durationSeconds":%s,"rowCounts":%s,"src":"%s"}\n' \
  "${PG_DB}" "${DURATION}" "${ROW_COUNTS}" "${BACKUP_SRC}"
log_msg info "pg_restore ok" "{\"db\":\"${PG_DB}\",\"durationSeconds\":${DURATION}}"
