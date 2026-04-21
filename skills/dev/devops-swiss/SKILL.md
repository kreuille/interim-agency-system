# Skill — DevOps / SRE (contexte suisse)

## Rôle
DevOps / SRE qui déploie et exploite en Suisse. Connaît les fournisseurs CH, les contraintes nLPD, la mise en prod sans downtime.

## Quand l'utiliser
Setup infra, CI/CD, Docker, observabilité, incident, runbook, sauvegarde.

## Concepts clés
- **Hébergement Suisse** obligatoire en pratique : Infomaniak Public Cloud (OpenStack), Exoscale (Akamai/Swisscom), Swisscom Cloud. Zurich GCP europe-west6 acceptable avec DPA.
- **12-factor app** : config par env, stateless, logs stdout/stderr.
- **Immutability** : images Docker signées, jamais de patch en prod.
- **Observabilité** = logs structurés + métriques RED + traces OTel.

## Règles dures
- Zero secret committed. Period.
- Images Docker multi-stage, utilisateur non-root, HEALTHCHECK, distroless ou alpine minimaliste.
- CI bloquante sur : lint, typecheck, tests, build, scan Trivy. Temps cible ≤ 10 min.
- Prod ≠ staging ≠ local : mêmes images, configs différentes. Migration Prisma testée en staging avant prod.
- Backup Postgres chiffré, restauration **testée mensuellement** (sinon ce n'est pas un backup).

## Pratiques
- `docker-compose.yml` pour le local (postgres, redis, mailhog, mock MP).
- `Dockerfile` prod avec pinning digest SHA256 des images de base.
- GitHub Actions avec OIDC vers Infomaniak/Exoscale — pas de long-lived secret.
- Deploy via Helm (si K8s) ou script `deploy.sh` + Ansible (si VM). Décider en A0.4 par ADR.
- Observabilité : Sentry (erreurs), Grafana Cloud (dashboards + alertmanager), OpenTelemetry (traces).
- Alerting : P1 (prod down) → SMS on-call + Slack ; P2 (dégradation) → Slack ; P3 (warning) → ticket.
- Runbook par type d'incident (`docs/runbooks/`), testé via gameday trimestriel.

## Dockerfile pattern

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
RUN pnpm fetch

FROM deps AS build
COPY . .
RUN pnpm install --offline && pnpm -r build

FROM node:20-alpine AS prod
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/apps/api/dist ./dist
COPY --from=build --chown=app:app /app/apps/api/package.json ./
COPY --from=deps --chown=app:app /app/node_modules ./node_modules
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/main.js"]
```

## CI GitHub Actions — squelette

```yaml
name: ci
on: [push, pull_request]
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test -- --coverage
      - uses: codecov/codecov-action@v4
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: aquasecurity/trivy-action@master
        with: { image-ref: '.', scan-type: fs, severity: HIGH,CRITICAL }
```

## Pièges courants
- Deployer directement depuis main sans passer par un tag versionné — impossible de rollback proprement.
- Logs en plain text non parsables par Grafana Loki. Toujours JSON structuré (pino + pretty en dev).
- Oublier de test-restaurer le backup ; le jour du sinistre, la sauvegarde est corrompue.
- Faire dépendre un déploiement d'une action manuelle humaine (clic dans un panel). Tout doit être automatisable.
- Stocker des logs applicatifs contenant du PII sans pseudonymisation. Fuite nLPD.

## Références
- `docs/05-architecture.md §8`
- https://www.infomaniak.com/fr/hebergement/public-cloud
- https://www.exoscale.com
- https://12factor.net
