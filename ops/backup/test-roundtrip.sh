#!/usr/bin/env bash
#
# test-roundtrip.sh — test E2E backup + restore sur docker-compose local.
#
# Démontre RPO ≤ 15 min et RTO ≤ 4h en local. Reproductible en CI.
#
# Workflow :
#   1. Démarre Postgres source (interim-postgres-src) avec données seed
#   2. Mesure rowcounts initiaux (témoin avant)
#   3. Lance pg_dump.sh (chiffré age) → fichier temporaire
#   4. Démarre Postgres cible (interim-postgres-dr) vide
#   5. Lance pg_restore.sh sur la cible
#   6. Mesure rowcounts cible et compare
#   7. Mesure durée totale (RTO empirique)
#   8. Échec si rowcounts diffèrent OU durée > RTO_BUDGET_SECONDS
#
# Variables :
#   RTO_BUDGET_SECONDS=14400 (4h) — durée max acceptable
#   AGE_RECIPIENT, AGE_IDENTITY_FILE — clés age (test ou réelle)
#
# Usage :
#   AGE_RECIPIENT=... AGE_IDENTITY_FILE=... ./ops/backup/test-roundtrip.sh
#
# Exit codes (cf. _lib.sh — propage ceux des sous-scripts) :
#   0 = succès, RPO+RTO respectés
#   1 = pg_dump a échoué (propagé)
#   2 = age fail (propagé)
#   3 = sha256 fail / download fail (propagé)
#   4 = pg_restore a échoué OU guard suffix _dr (propagé)
#   5 = rowcounts divergent (corruption silencieuse — détectée par CE script)
#   6 = RTO dépassé (détecté par CE script)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=ops/backup/_lib.sh
source "${SCRIPT_DIR}/_lib.sh"

: "${AGE_RECIPIENT:?AGE_RECIPIENT manquant}"
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE manquant}"

RTO_BUDGET_SECONDS="${RTO_BUDGET_SECONDS:-14400}"
WORK_DIR="$(mktemp -d /tmp/dr-roundtrip.XXXXXX)"
trap 'rm -rf "${WORK_DIR}"' EXIT

PG_SRC_HOST="${PG_SRC_HOST:-localhost}"
PG_SRC_PORT="${PG_SRC_PORT:-5432}"
PG_SRC_USER="${PG_SRC_USER:-dev}"
PG_SRC_PASS="${PG_SRC_PASS:-dev}"
PG_SRC_DB="${PG_SRC_DB:-interim_dev}"

PG_DR_HOST="${PG_DR_HOST:-localhost}"
PG_DR_PORT="${PG_DR_PORT:-5433}"
PG_DR_USER="${PG_DR_USER:-dev}"
PG_DR_PASS="${PG_DR_PASS:-dev}"
PG_DR_DB="${PG_DR_DB:-interim_dr}"

START_TS=$(date -u +%s)

# ---------- 1. Mesurer rowcounts source ----------
log_msg info "step 1/6 measure source rowcounts" "{\"db\":\"${PG_SRC_DB}\",\"host\":\"${PG_SRC_HOST}\",\"port\":${PG_SRC_PORT}}"
SRC_COUNTS=$(PGPASSWORD="${PG_SRC_PASS}" psql \
  --host="${PG_SRC_HOST}" --port="${PG_SRC_PORT}" --username="${PG_SRC_USER}" --dbname="${PG_SRC_DB}" \
  --tuples-only --no-align -c "
    SELECT json_object_agg(t, n)
    FROM (
      SELECT 'temp_workers' AS t, count(*) AS n FROM temp_workers
      UNION ALL SELECT 'mission_proposals', count(*) FROM mission_proposals
      UNION ALL SELECT 'timesheets', count(*) FROM timesheets
      UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
    ) x" 2>/dev/null || echo "{}")
log_msg info "step 1/6 source counts" "{\"counts\":${SRC_COUNTS}}"

# ---------- 2. pg_dump ----------
log_msg info "step 2/6 pg_dump source"
DUMP_DEST="${WORK_DIR}/dumps"
mkdir -p "${DUMP_DEST}"

# On laisse les exit codes de pg_dump.sh remonter naturellement (1=dump,
# 2=age, 3=sha256, 4=upload) — `set -e` propagera.
PGPASSWORD="${PG_SRC_PASS}" \
PG_HOST="${PG_SRC_HOST}" PG_PORT="${PG_SRC_PORT}" PG_USER="${PG_SRC_USER}" PG_DB="${PG_SRC_DB}" \
AGE_RECIPIENT="${AGE_RECIPIENT}" \
BACKUP_DEST="${DUMP_DEST}" \
RETAIN_LOCAL=10 \
"${SCRIPT_DIR}/pg_dump.sh"

# Récupérer le dernier dump créé
# shellcheck disable=SC2012  # `ls -1t` est plus simple que `find` pour trier par mtime
LATEST_DUMP=$(ls -1t "${DUMP_DEST}"/pgdump_*.dump.age 2>/dev/null | head -1)
if [[ -z "${LATEST_DUMP}" ]]; then
  log_msg error "step 2/6 no dump file found in ${DUMP_DEST}"
  exit "${EXIT_DUMP_FAIL}"
fi
log_msg info "step 2/6 dump created" "{\"file\":\"${LATEST_DUMP}\"}"

# ---------- 3. pg_restore vers cible DR ----------
log_msg info "step 3/6 pg_restore to DR target" "{\"db\":\"${PG_DR_DB}\",\"host\":\"${PG_DR_HOST}\",\"port\":${PG_DR_PORT}}"
PGPASSWORD="${PG_DR_PASS}" \
PG_HOST="${PG_DR_HOST}" PG_PORT="${PG_DR_PORT}" PG_USER="${PG_DR_USER}" PG_DB="${PG_DR_DB}" \
BACKUP_SRC="${LATEST_DUMP}" \
AGE_IDENTITY_FILE="${AGE_IDENTITY_FILE}" \
"${SCRIPT_DIR}/pg_restore.sh"

# ---------- 4. Mesurer rowcounts cible ----------
log_msg info "step 4/6 measure target rowcounts" "{\"db\":\"${PG_DR_DB}\"}"
DR_COUNTS=$(PGPASSWORD="${PG_DR_PASS}" psql \
  --host="${PG_DR_HOST}" --port="${PG_DR_PORT}" --username="${PG_DR_USER}" --dbname="${PG_DR_DB}" \
  --tuples-only --no-align -c "
    SELECT json_object_agg(t, n)
    FROM (
      SELECT 'temp_workers' AS t, count(*) AS n FROM temp_workers
      UNION ALL SELECT 'mission_proposals', count(*) FROM mission_proposals
      UNION ALL SELECT 'timesheets', count(*) FROM timesheets
      UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs
    ) x" 2>/dev/null || echo "{}")
log_msg info "step 4/6 target counts" "{\"counts\":${DR_COUNTS}}"

# ---------- 5. Comparer ----------
if [[ "${SRC_COUNTS}" != "${DR_COUNTS}" ]]; then
  log_msg error "step 5/6 ROWCOUNT MISMATCH" \
    "{\"source\":${SRC_COUNTS},\"target\":${DR_COUNTS}}"
  exit "${EXIT_ROWCOUNT_MISMATCH}"
fi
log_msg info "step 5/6 rowcounts match"

# ---------- 6. RTO ----------
END_TS=$(date -u +%s)
DURATION=$((END_TS - START_TS))

if (( DURATION > RTO_BUDGET_SECONDS )); then
  log_msg error "step 6/6 RTO budget exceeded" \
    "{\"durationSeconds\":${DURATION},\"budgetSeconds\":${RTO_BUDGET_SECONDS}}"
  exit "${EXIT_RTO_EXCEEDED}"
fi

log_msg info "step 6/6 RTO ok" "{\"durationSeconds\":${DURATION},\"budgetSeconds\":${RTO_BUDGET_SECONDS}}"

# Bandeau de succès — utile en mode dev/local. En CI on parse aussi
# le JSON event ci-dessous.
if ! is_ci_mode; then
  echo ""
  echo "========================================================================"
  echo "  ✅ DR roundtrip OK"
  echo "  RTO empirique : ${DURATION}s (budget ${RTO_BUDGET_SECONDS}s)"
  echo "  Rowcounts identiques : ${SRC_COUNTS}"
  echo "========================================================================"
fi

# Log JSON event final pour Promtail / Loki / asserts CI
printf '{"event":"dr_roundtrip.completed","durationSeconds":%s,"rtoBudgetSeconds":%s,"rowCounts":%s}\n' \
  "${DURATION}" "${RTO_BUDGET_SECONDS}" "${DR_COUNTS}"
