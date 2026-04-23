#!/usr/bin/env bash
#
# pg_dump.sh — backup Postgres chiffré pour Helvètia Intérim.
#
# Génère un dump pg_dump format custom (-Fc), chiffré via age (modern
# alternative à gpg : clés courtes, format simple), et écrit dans un
# bucket cible (local en dev, GCS en prod via gcsfuse ou gsutil).
#
# Conformité (CLAUDE.md §3.4) :
# - Chiffrement au repos obligatoire : age avec clé recipient (pas de
#   passphrase à gérer en script ; la clé de déchiffrement reste dans
#   le secret manager Infomaniak/GCP).
# - Pseudonymisation logs : pas de nom de table en clair dans les
#   timestamps de noms de fichiers.
# - Rétention : géré côté bucket (lifecycle policy 90 jours, voir
#   ops/backup/README.md).
#
# RPO = 15 min cible :
#   - Dump complet quotidien (cron 02:00 UTC, soit 04:00 Europe/Zurich)
#   - WAL archiving continu (toutes les 5 min via wal-archive.sh)
#
# Usage :
#   PG_HOST=postgres PG_USER=interim PG_DB=interim_prod \
#   AGE_RECIPIENT=age1xyz... \
#   BACKUP_DEST=/var/backups/interim \
#   ./ops/backup/pg_dump.sh
#
# Exit codes :
#   0 = succès, dump+chiffrement+upload OK
#   1 = paramètres manquants
#   2 = pg_dump a échoué
#   3 = chiffrement age a échoué
#   4 = upload destination a échoué
#
# Dépendances :
#   - postgresql-client (pg_dump 16+)
#   - age (https://age-encryption.org)
#   - bash 4+, set -euo pipefail
#
# Référence : skills/dev/devops-swiss/SKILL.md § Backup Postgres
# Référence : docs/runbooks/disaster-recovery.md

set -euo pipefail

# ---------- Validation paramètres ----------
: "${PG_HOST:?PG_HOST manquant — ex: postgres ou cloud-sql-proxy}"
: "${PG_USER:?PG_USER manquant}"
: "${PG_DB:?PG_DB manquant}"
: "${AGE_RECIPIENT:?AGE_RECIPIENT manquant — clé publique age (age1...)}"
: "${BACKUP_DEST:?BACKUP_DEST manquant — répertoire ou gs:// URI}"

PG_PORT="${PG_PORT:-5432}"
RETAIN_LOCAL="${RETAIN_LOCAL:-3}"  # nb de dumps locaux à garder avant upload bucket

# Timestamp ISO 8601 sans `:` (compatible noms de fichiers Windows si
# le bucket est exporté SMB) — Z = UTC explicite.
TS=$(date -u +%Y%m%dT%H%M%SZ)
WORK_DIR=$(mktemp -d /tmp/pg_dump.XXXXXX)
trap 'rm -rf "${WORK_DIR}"' EXIT

DUMP_FILE="${WORK_DIR}/pgdump_${PG_DB}_${TS}.dump"
ENCRYPTED_FILE="${WORK_DIR}/pgdump_${PG_DB}_${TS}.dump.age"
SHA256_FILE="${ENCRYPTED_FILE}.sha256"

# ---------- pg_dump ----------
echo "[pg_dump] start ${PG_DB}@${PG_HOST}:${PG_PORT} → ${DUMP_FILE}"
PGPASSWORD="${PGPASSWORD:-}" pg_dump \
  --host="${PG_HOST}" \
  --port="${PG_PORT}" \
  --username="${PG_USER}" \
  --dbname="${PG_DB}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --verbose \
  --file="${DUMP_FILE}" 2>"${WORK_DIR}/pg_dump.stderr" || {
  echo "[pg_dump] FAILED — see stderr:"
  cat "${WORK_DIR}/pg_dump.stderr" >&2
  exit 2
}

DUMP_SIZE=$(stat -c%s "${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_FILE}")
echo "[pg_dump] OK — ${DUMP_SIZE} bytes"

# ---------- age encrypt ----------
echo "[age] encrypt → ${ENCRYPTED_FILE}"
age --encrypt --recipient "${AGE_RECIPIENT}" --output "${ENCRYPTED_FILE}" "${DUMP_FILE}" || {
  echo "[age] FAILED" >&2
  exit 3
}
ENCRYPTED_SIZE=$(stat -c%s "${ENCRYPTED_FILE}" 2>/dev/null || stat -f%z "${ENCRYPTED_FILE}")
echo "[age] OK — ${ENCRYPTED_SIZE} bytes"

# ---------- checksum ----------
sha256sum "${ENCRYPTED_FILE}" | awk '{print $1}' >"${SHA256_FILE}"
echo "[sha256] $(cat "${SHA256_FILE}")"

# ---------- upload ----------
case "${BACKUP_DEST}" in
  gs://*)
    # GCS via gsutil (préinstallé sur Cloud Run / Compute Engine)
    echo "[upload] gsutil cp → ${BACKUP_DEST}/"
    gsutil -q cp "${ENCRYPTED_FILE}" "${BACKUP_DEST}/" || { echo "[upload] gsutil failed" >&2; exit 4; }
    gsutil -q cp "${SHA256_FILE}" "${BACKUP_DEST}/" || { echo "[upload] gsutil failed (sha256)" >&2; exit 4; }
    ;;
  *)
    # Filesystem local (dev, ou bucket monté via gcsfuse)
    mkdir -p "${BACKUP_DEST}"
    cp "${ENCRYPTED_FILE}" "${BACKUP_DEST}/" || { echo "[upload] cp failed" >&2; exit 4; }
    cp "${SHA256_FILE}" "${BACKUP_DEST}/" || { echo "[upload] cp failed (sha256)" >&2; exit 4; }
    echo "[upload] local cp → ${BACKUP_DEST}"

    # Garder uniquement les N derniers dumps locaux
    if [[ -d "${BACKUP_DEST}" ]]; then
      pushd "${BACKUP_DEST}" >/dev/null
      # shellcheck disable=SC2012
      ls -1tr pgdump_*.dump.age 2>/dev/null | head -n -"${RETAIN_LOCAL}" | xargs -r rm -f
      # shellcheck disable=SC2012
      ls -1tr pgdump_*.dump.age.sha256 2>/dev/null | head -n -"${RETAIN_LOCAL}" | xargs -r rm -f
      popd >/dev/null
    fi
    ;;
esac

# ---------- output structuré (consommable par Promtail) ----------
echo "{\"event\":\"pg_dump.completed\",\"db\":\"${PG_DB}\",\"timestamp\":\"${TS}\",\"sizeBytes\":${ENCRYPTED_SIZE},\"sha256\":\"$(cat "${SHA256_FILE}")\",\"dest\":\"${BACKUP_DEST}\"}"
