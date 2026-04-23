#!/usr/bin/env bash
#
# wal-archive.sh — push WAL Postgres vers bucket pour PITR (RPO ≤ 15 min).
#
# Appelé par Postgres via `archive_command` (postgresql.conf) :
#
#     archive_command = '/etc/postgres/wal-archive.sh %p %f'
#
# où %p = chemin complet du WAL, %f = nom du fichier (24 hex chars).
#
# Conformité :
# - Chiffrement age comme pour les dumps (clé recipient publique)
# - Atomic upload (gsutil cp -n pour éviter overwrite si retry)
# - Exit non-zéro = Postgres réessaye automatiquement
#
# RPO calculé : si on archive toutes les 5 min (cron WAL switch via
# `pg_switch_wal()`) + lag réseau < 1 min, RPO ≤ 6 min en pire cas
# (panne juste après switch).
#
# Usage :
#   AGE_RECIPIENT=age1xyz... \
#   WAL_DEST=gs://interim-prod-wal/ \
#   ./wal-archive.sh /var/lib/postgresql/data/pg_wal/000000010000... 000000010000...
#
# Exit codes :
#   0 = succès
#   1 = paramètres manquants
#   2 = chiffrement échoué (Postgres retry)
#   3 = upload échoué (Postgres retry)

set -euo pipefail

WAL_PATH="${1:?missing %p — WAL absolute path}"
WAL_NAME="${2:?missing %f — WAL filename}"

: "${AGE_RECIPIENT:?AGE_RECIPIENT manquant}"
: "${WAL_DEST:?WAL_DEST manquant — gs://... ou répertoire local}"

WORK_DIR=$(mktemp -d /tmp/wal-archive.XXXXXX)
trap 'rm -rf "${WORK_DIR}"' EXIT

ENCRYPTED="${WORK_DIR}/${WAL_NAME}.age"

age --encrypt --recipient "${AGE_RECIPIENT}" --output "${ENCRYPTED}" "${WAL_PATH}" || exit 2

case "${WAL_DEST}" in
  gs://*)
    # `cp -n` : refuse d'overwrite si l'objet existe déjà (idempotence
    # safe contre retry Postgres).
    gsutil -q cp -n "${ENCRYPTED}" "${WAL_DEST}/${WAL_NAME}.age" || exit 3
    ;;
  *)
    mkdir -p "${WAL_DEST}"
    # Move atomic seulement si destination ne contient pas déjà ce fichier
    if [[ -e "${WAL_DEST}/${WAL_NAME}.age" ]]; then
      echo "[wal-archive] ${WAL_NAME}.age déjà présent — skip (idempotence Postgres retry)"
      exit 0
    fi
    cp "${ENCRYPTED}" "${WAL_DEST}/${WAL_NAME}.age" || exit 3
    ;;
esac

# Pas de log JSON ici (volume potentiellement énorme : 1 WAL toutes les
# minutes = 1440 lignes/jour). Postgres logue déjà via archive_command.
exit 0
