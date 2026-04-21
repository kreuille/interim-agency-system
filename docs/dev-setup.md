# Démarrage local — guide dev

> Objectif : un dev qui clone le repo démarre l'environnement complet en **moins de 2 minutes**, sans rien installer hors Node + pnpm + Docker.

## Pré-requis

- **Node.js 20** (`.nvmrc`) — `nvm install && nvm use`
- **pnpm 10** — `corepack enable && corepack prepare pnpm@10 --activate`
- **Docker Desktop** (ou Docker Engine + Compose v2) — https://docs.docker.com/get-docker/
- **make** (macOS/Linux d'origine ; Windows : `choco install make` ou utiliser les commandes `docker compose` / `pnpm` listées sous chaque cible du `Makefile`)

## Étapes

```bash
git clone https://github.com/kreuille/interim-agency-system.git
cd interim-agency-system
cp .env.example .env       # adapter si besoin, aucun secret de prod
pnpm install               # ~60 s, 400+ paquets
make up                    # lance Postgres, Redis, MailHog, mock MovePlanner
make smoke                 # smoke-test de chaque service
pnpm dev                   # API + web-admin + web-portal + worker en parallèle
```

## Services locaux exposés par `make up`

| Service | Port | URL | Credentials |
|---------|------|-----|-------------|
| Postgres 16 | 5432 | `postgresql://dev:dev@localhost:5432/interim_dev` | dev / dev |
| Redis 7 | 6379 | `redis://localhost:6379` | — |
| MailHog SMTP | 1025 | — | — |
| MailHog UI | 8025 | http://localhost:8025 | — |
| Mock MovePlanner | 3030 | http://localhost:3030 | HMAC secret `dev-mock-secret` |

Aucun de ces credentials n'est valide hors machine locale.

## Commandes `make`

| Commande | Effet |
|----------|-------|
| `make up` | Lance les services en arrière-plan |
| `make down` | Arrête les services (conserve volumes) |
| `make reset` | Détruit volumes et relance (perte de données locales) |
| `make logs` | Stream des logs (Ctrl-C pour quitter) |
| `make ps` | État des conteneurs |
| `make smoke` | Smoke-test (Postgres pg_isready, Redis ping, MailHog UI, Mock MP /health) |
| `make typecheck` / `make lint` / `make test` / `make format` | Raccourcis pnpm |

## Mock MovePlanner

Le conteneur `mock-moveplanner` expose une sous-partie de l'API MP (endpoints de `docs/02-partners-specification.md`) avec des fixtures en mémoire. Il permet de développer sans dépendre de la sandbox MP réelle (levier BLOCKER-001 dans PROGRESS.md).

Endpoints stubbés :
- `POST /api/v1/partners/:id/workers`
- `POST /api/v1/partners/:id/workers/:staffId/availability`
- `POST /api/v1/partners/:id/assignments/:requestId/response`
- `POST /api/v1/partners/:id/timesheets/:id/sign`
- `GET /api/v1/partners/:id/timesheets`

Endpoint admin pour simuler un webhook signé entrant :

```bash
curl -X POST http://localhost:3030/_mock/emit-webhook \
  -H 'content-type: application/json' \
  -d '{
    "event": "worker.assignment.proposed",
    "payload": { "staffId": "mock-staff-1", "requestId": "req-42" }
  }'
```

Le mock signe le body avec HMAC-SHA256 + secret `dev-mock-secret`, puis POST vers `API_WEBHOOK_URL` (par défaut `http://host.docker.internal:3000/webhooks/moveplanner`).

## Troubleshooting

- **Port 5432 déjà pris** : un Postgres local tourne. `sudo lsof -i :5432` puis `brew services stop postgresql` ou équivalent.
- **`host.docker.internal` injoignable depuis le conteneur mock** : vérifier la directive `extra_hosts` dans `docker-compose.yml` (déjà posée). Sur Linux pur, elle pointe vers la gateway.
- **MailHog UI blanche** : vérifier port 8025 et navigateur récent.
- **Volume Postgres corrompu** : `make reset` (attention, efface la base).

## Sécurité

Aucun secret réel dans `.env.example`, ni dans `docker-compose.yml`. Les secrets de dev sont des chaînes littérales sans valeur hors machine locale. Pour les secrets de staging/prod, utiliser le secret manager (voir A0.4).
