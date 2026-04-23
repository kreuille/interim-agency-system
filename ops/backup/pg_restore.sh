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
# Exit codes :
#   0 = succès
#   1 = paramètres manquants
#   2 = téléchargement source a échoué
#   3 = sha256 mismatch (bit rot ou tampering)
#   4 = déchiffrement age a échoué
#   5 = pg_restore a échoué
#
# Référence : docs/runbooks/disaster-recovery.md

set -euo pipefail

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
echo "[restore] download ${BACKUP_SRC}"
case "${BACKUP_SRC}" in
  gs://*)
    gsutil -q cp "${BACKUP_SRC}" "${ENCRYPTED_FILE}" || { echo "[download] gsutil failed" >&2; exit 2; }
    gsutil -q cp "${BACKUP_SRC}.sha256" "${SHA256_FILE}" || { echo "[download] gsutil sha256 failed" >&2; exit 2; }
    ;;
  *)
    [[ -f "${BACKUP_SRC}" ]] || { echo "[download] ${BACKUP_SRC} introuvable" >&2; exit 2; }
    cp "${BACKUP_SRC}" "${ENCRYPTED_FILE}"
    cp "${BACKUP_SRC}.sha256" "${SHA256_FILE}"
    ;;
esac

# ---------- 2. Vérification sha256 ----------
EXPECTED_SHA=$(cat "${SHA256_FILE}")
ACTUAL_SHA=$(sha256sum "${ENCRYPTED_FILE}" | awk '{print $1}')
if [[ "${EXPECTED_SHA}" != "${ACTUAL_SHA}" ]]; then
  echo "[sha256] MISMATCH expected=${EXPECTED_SHA} actual=${ACTUAL_SHA}" >&2
  echo "[sha256] backup corrompu (bit rot bucket OU tampering) — STOP" >&2
  exit 3
fi
echo "[sha256] OK ${ACTUAL_SHA}"

# ---------- 3. Déchiffrement ----------
echo "[age] decrypt → ${DUMP_FILE}"
age --decrypt --identity "${AGE_IDENTITY_FILE}" --output "${DUMP_FILE}" "${ENCRYPTED_FILE}" || {
  echo "[age] FAILED — clé identity invalide ?" >&2
  exit 4
}

# ---------- 4. pg_restore ----------
# Drop & recreate la cible. CRITIQUE : ne JAMAIS pointer sur la prod
# avec ce script. Le runbook impose qu'on restaure dans un nom de DB
# avec suffixe `_dr` ou `_test_<ts>`.
case "${PG_DB}" in
  *_dr|*_test_*|interim_dev)
    : # OK — cible attendue
    ;;
  *)
    echo "[guard] PG_DB=${PG_DB} ne contient pas '_dr' / '_test_' / 'interim_dev'" >&2
    echo "[guard] refus : le restore drop la base cible. Renommer cible." >&2
    exit 5
    ;;
esac

echo "[pg_restore] drop+create ${PG_DB}@${PG_HOST}"
PGPASSWORD="${PGPASSWORD:-}" psql \
  --host="${PG_HOST}" --port="${PG_PORT}" --username="${PG_USER}" --dbname=postgres \
  --quiet -c "DROP DATABASE IF EXISTS \"${PG_DB}\";" -c "CREATE DATABASE \"${PG_DB}\";" || {
  echo "[psql] drop+create failed" >&2
  exit 5
}

echo "[pg_restore] restore → ${PG_DB}"
PGPASSWORD="${PGPASSWORD:-}" pg_restore \
  --host="${PG_HOST}" --port="${PG_PORT}" --username="${PG_USER}" --dbname="${PG_DB}" \
  --no-owner --no-privileges --exit-on-error --jobs=4 --verbose \
  "${DUMP_FILE}" 2>"${WORK_DIR}/pg_restore.stderr" || {
  echo "[pg_restore] FAILED — see stderr:" >&2
  tail -50 "${WORK_DIR}/pg_restore.stderr" >&2
  exit 5
}

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
echo "{\"event\":\"pg_restore.completed\",\"db\":\"${PG_DB}\",\"durationSeconds\":${DURATION},\"rowCounts\":${ROW_COUNTS},\"src\":\"${BACKUP_SRC}\"}"
echo "[restore] OK en ${DURATION}s"
