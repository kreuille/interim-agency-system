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
# Exit codes (cf. _lib.sh) :
#   0 = succès, dump+chiffrement+upload OK
#   1 = pg_dump a échoué (EXIT_DUMP_FAIL)
#   2 = chiffrement age a échoué (EXIT_AGE_FAIL)
#   3 = génération sha256 a échoué (EXIT_SHA256_FAIL)
#   4 = upload destination a échoué (EXIT_RESTORE_FAIL — overlap acceptable)
#
# Dépendances :
#   - postgresql-client (pg_dump 16+)
#   - age (https://age-encryption.org)
#   - bash 4+, set -euo pipefail
#
# Référence : skills/dev/devops-swiss/SKILL.md § Backup Postgres
# Référence : docs/runbooks/disaster-recovery.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/backup/_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

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
log_msg info "pg_dump start" "{\"db\":\"${PG_DB}\",\"host\":\"${PG_HOST}\",\"port\":${PG_PORT},\"out\":\"${DUMP_FILE}\"}"
if ! PGPASSWORD="${PGPASSWORD:-}" pg_dump \
  --host="${PG_HOST}" \
  --port="${PG_PORT}" \
  --username="${PG_USER}" \
  --dbname="${PG_DB}" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --verbose \
  --file="${DUMP_FILE}" 2>"${WORK_DIR}/pg_dump.stderr"; then
  log_msg error "pg_dump failed" "{\"db\":\"${PG_DB}\",\"stderr_tail\":\"$(tail -5 "${WORK_DIR}/pg_dump.stderr" | tr '\n' ' ' | cut -c1-200)\"}"
  cat "${WORK_DIR}/pg_dump.stderr" >&2
  exit "${EXIT_DUMP_FAIL}"
fi

DUMP_SIZE=$(stat -c%s "${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_FILE}")
log_msg info "pg_dump ok" "{\"db\":\"${PG_DB}\",\"sizeBytes\":${DUMP_SIZE}}"

# ---------- age encrypt ----------
log_msg info "age encrypt start" "{\"out\":\"${ENCRYPTED_FILE}\"}"
if ! age --encrypt --recipient "${AGE_RECIPIENT}" --output "${ENCRYPTED_FILE}" "${DUMP_FILE}"; then
  log_msg error "age encrypt failed" "{\"recipientHint\":\"${AGE_RECIPIENT:0:8}...\"}"
  exit "${EXIT_AGE_FAIL}"
fi
ENCRYPTED_SIZE=$(stat -c%s "${ENCRYPTED_FILE}" 2>/dev/null || stat -f%z "${ENCRYPTED_FILE}")
log_msg info "age encrypt ok" "{\"sizeBytes\":${ENCRYPTED_SIZE}}"

# Sanity check : header age = "age-encryption.org/v1\n" en clair
# (cf. https://age-encryption.org/v1) — assert qu'on a bien écrit un
# blob age et pas du plain text par accident.
AGE_MAGIC=$(head -c 22 "${ENCRYPTED_FILE}" 2>/dev/null || true)
if [[ "${AGE_MAGIC}" != "age-encryption.org/v1" ]]; then
  log_msg error "age header invalid" "{\"got\":\"${AGE_MAGIC}\"}"
  exit "${EXIT_AGE_FAIL}"
fi

# ---------- checksum ----------
if ! sha256sum "${ENCRYPTED_FILE}" | awk '{print $1}' >"${SHA256_FILE}"; then
  log_msg error "sha256 generation failed"
  exit "${EXIT_SHA256_FAIL}"
fi
SHA_HASH="$(cat "${SHA256_FILE}")"
log_msg info "sha256 ok" "{\"sha256\":\"${SHA_HASH}\"}"

# ---------- upload ----------
case "${BACKUP_DEST}" in
  gs://*)
    # GCS via gsutil (préinstallé sur Cloud Run / Compute Engine)
    log_msg info "upload gsutil start" "{\"dest\":\"${BACKUP_DEST}\"}"
    if ! gsutil -q cp "${ENCRYPTED_FILE}" "${BACKUP_DEST}/"; then
      log_msg error "upload gsutil failed (dump)" "{\"dest\":\"${BACKUP_DEST}\"}"
      exit "${EXIT_RESTORE_FAIL}"
    fi
    if ! gsutil -q cp "${SHA256_FILE}" "${BACKUP_DEST}/"; then
      log_msg error "upload gsutil failed (sha256)" "{\"dest\":\"${BACKUP_DEST}\"}"
      exit "${EXIT_RESTORE_FAIL}"
    fi
    ;;
  *)
    # Filesystem local (dev, ou bucket monté via gcsfuse)
    mkdir -p "${BACKUP_DEST}"
    if ! cp "${ENCRYPTED_FILE}" "${BACKUP_DEST}/"; then
      log_msg error "upload cp failed (dump)" "{\"dest\":\"${BACKUP_DEST}\"}"
      exit "${EXIT_RESTORE_FAIL}"
    fi
    if ! cp "${SHA256_FILE}" "${BACKUP_DEST}/"; then
      log_msg error "upload cp failed (sha256)" "{\"dest\":\"${BACKUP_DEST}\"}"
      exit "${EXIT_RESTORE_FAIL}"
    fi
    log_msg info "upload local cp ok" "{\"dest\":\"${BACKUP_DEST}\"}"

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

# ---------- output structuré final (event consommable Promtail/CI) ----------
# Ce log est INTENTIONNELLEMENT au format JSON event-style (différent
# du format JSON Lines de log_msg) — il est consommé par les asserts
# CI (workflow dr-roundtrip.yml) qui parsent `event=pg_dump.completed`.
printf '{"event":"pg_dump.completed","db":"%s","timestamp":"%s","sizeBytes":%s,"sha256":"%s","dest":"%s"}\n' \
  "${PG_DB}" "${TS}" "${ENCRYPTED_SIZE}" "${SHA_HASH}" "${BACKUP_DEST}"
