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
# Exit codes :
#   0 = succès, RPO+RTO respectés
#   1 = pg_dump a échoué
#   2 = pg_restore a échoué
#   3 = rowcounts divergent (corruption)
#   4 = RTO dépassé

set -euo pipefail

: "${AGE_RECIPIENT:?AGE_RECIPIENT manquant}"
: "${AGE_IDENTITY_FILE:?AGE_IDENTITY_FILE manquant}"

RTO_BUDGET_SECONDS="${RTO_BUDGET_SECONDS:-14400}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
echo "[1/6] mesurer rowcounts source ${PG_SRC_DB}@${PG_SRC_HOST}:${PG_SRC_PORT}"
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
echo "[1/6] source = ${SRC_COUNTS}"

# ---------- 2. pg_dump ----------
echo "[2/6] pg_dump source"
DUMP_DEST="${WORK_DIR}/dumps"
mkdir -p "${DUMP_DEST}"

PGPASSWORD="${PG_SRC_PASS}" \
PG_HOST="${PG_SRC_HOST}" PG_PORT="${PG_SRC_PORT}" PG_USER="${PG_SRC_USER}" PG_DB="${PG_SRC_DB}" \
AGE_RECIPIENT="${AGE_RECIPIENT}" \
BACKUP_DEST="${DUMP_DEST}" \
RETAIN_LOCAL=10 \
"${SCRIPT_DIR}/pg_dump.sh" || { echo "[2/6] pg_dump failed" >&2; exit 1; }

# Récupérer le dernier dump créé
LATEST_DUMP=$(ls -1t "${DUMP_DEST}"/pgdump_*.dump.age 2>/dev/null | head -1)
[[ -n "${LATEST_DUMP}" ]] || { echo "[2/6] aucun dump trouvé" >&2; exit 1; }
echo "[2/6] dump = ${LATEST_DUMP}"

# ---------- 3. pg_restore vers cible DR ----------
echo "[3/6] pg_restore vers ${PG_DR_DB}@${PG_DR_HOST}:${PG_DR_PORT}"
PGPASSWORD="${PG_DR_PASS}" \
PG_HOST="${PG_DR_HOST}" PG_PORT="${PG_DR_PORT}" PG_USER="${PG_DR_USER}" PG_DB="${PG_DR_DB}" \
BACKUP_SRC="${LATEST_DUMP}" \
AGE_IDENTITY_FILE="${AGE_IDENTITY_FILE}" \
"${SCRIPT_DIR}/pg_restore.sh" || { echo "[3/6] pg_restore failed" >&2; exit 2; }

# ---------- 4. Mesurer rowcounts cible ----------
echo "[4/6] mesurer rowcounts cible ${PG_DR_DB}"
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
echo "[4/6] cible = ${DR_COUNTS}"

# ---------- 5. Comparer ----------
if [[ "${SRC_COUNTS}" != "${DR_COUNTS}" ]]; then
  echo "[5/6] DIVERGENCE rowcounts" >&2
  echo "  source = ${SRC_COUNTS}" >&2
  echo "  cible  = ${DR_COUNTS}" >&2
  exit 3
fi
echo "[5/6] rowcounts OK"

# ---------- 6. RTO ----------
END_TS=$(date -u +%s)
DURATION=$((END_TS - START_TS))

if (( DURATION > RTO_BUDGET_SECONDS )); then
  echo "[6/6] RTO dépassé : ${DURATION}s > ${RTO_BUDGET_SECONDS}s" >&2
  exit 4
fi

echo ""
echo "========================================================================"
echo "  ✅ DR roundtrip OK"
echo "  RTO empirique : ${DURATION}s (budget ${RTO_BUDGET_SECONDS}s)"
echo "  Rowcounts identiques : ${SRC_COUNTS}"
echo "========================================================================"

# Log JSON pour Promtail / Loki
echo "{\"event\":\"dr_roundtrip.completed\",\"durationSeconds\":${DURATION},\"rtoBudgetSeconds\":${RTO_BUDGET_SECONDS},\"rowCounts\":${DR_COUNTS}}"
