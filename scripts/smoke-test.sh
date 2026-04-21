#!/usr/bin/env bash
# Smoke test : vérifie que chaque service docker-compose répond sur son port.
# Utilisation : `make smoke` (après `make up`).

set -euo pipefail

ok() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
ko() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

echo 'Smoke test — services locaux'

# Postgres
if docker compose exec -T postgres pg_isready -U dev -d interim_dev >/dev/null 2>&1; then
  ok 'Postgres prêt (pg_isready)'
else
  ko 'Postgres injoignable'
fi

# Redis
if docker compose exec -T redis redis-cli ping | grep -q PONG; then
  ok 'Redis répond PONG'
else
  ko 'Redis injoignable'
fi

# MailHog UI
if curl -fsS -o /dev/null http://localhost:8025/; then
  ok 'MailHog UI http://localhost:8025'
else
  ko 'MailHog UI injoignable'
fi

# Mock MovePlanner
if curl -fsS http://localhost:3030/health | grep -q '"status":"ok"'; then
  ok 'Mock MovePlanner http://localhost:3030/health'
else
  ko 'Mock MovePlanner injoignable'
fi

echo
echo 'Tous les services locaux sont up.'
