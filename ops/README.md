# `ops/` — infrastructure d'exploitation

Configurations versionnées pour observabilité, déploiement, backups.

## Structure

```
ops/
├── docker-compose.observability.yml   # Stack obs runnable localement
├── prometheus/                         # Scrape config + règles d'alerte
│   ├── prometheus.yml
│   └── rules/
│       ├── alerts-p1.yml               # On-call immédiat (SMS + Slack)
│       ├── alerts-p2.yml               # Slack dev-team
│       └── alerts-p3.yml               # Tickets Linear
├── alertmanager/
│   └── alertmanager.yml                # Routage P1/P2/P3 + receivers
├── loki/
│   └── loki-config.yml                 # Log aggregation (rétention 12 mois nLPD)
├── promtail/
│   └── promtail-config.yml             # Agent shipping logs Docker → Loki
├── tempo/
│   └── tempo-config.yml                # Distributed tracing (rétention 15 j)
└── grafana/
    ├── provisioning/
    │   ├── datasources/datasources.yml # Prometheus, Loki, Tempo
    │   └── dashboards/dashboards.yml   # Provider auto-load
    └── dashboards/
        ├── api-health.json             # RED metrics + p50/p95/p99 + logs
        ├── mp-health.json              # Circuit breaker + push success + outbox lag
        ├── payroll-batch.json          # Durée + workers payés + échecs + CHF brut
        └── queue-depth.json            # BullMQ waiting/active/failed par queue
```

## Lancer la stack obs en local

```bash
cd ops/
docker compose -f docker-compose.observability.yml up -d
```

Ports exposés :
- **3000** — Grafana UI (login `admin` / `admin`)
- **9090** — Prometheus UI
- **9093** — Alertmanager UI
- **3100** — Loki query API
- **3200** — Tempo query API
- **4317** / **4318** — Tempo OTLP gRPC / HTTP (les apps poussent les traces ici)

Une fois la stack lancée, dans un autre terminal démarre l'API avec les bonnes env :

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
export OTEL_SERVICE_NAME=interim-api
export LOG_LEVEL=info
pnpm -F @interim/api dev
```

L'API émettra :
- des **logs** JSON pino sur stdout → Promtail les scrape via Docker socket → Loki
- des **métriques** Prometheus exposées sur `GET /metrics` → Prometheus scrape
- des **traces** OTel exportées vers Tempo OTLP

Ouvre Grafana, va dans le dossier "Helvètia Intérim", tu verras les 4 dashboards provisionnés.

## Stopper la stack

```bash
docker compose -f docker-compose.observability.yml down       # garde les volumes
docker compose -f docker-compose.observability.yml down -v    # wipe tout (logs + métriques)
```

## Stack en production (GCP `europe-west6`)

En prod, on **ne tourne pas** Prometheus/Loki/Tempo nous-mêmes — on utilise **Grafana Cloud** (région EU avec DPA signé). Cette config locale sert :

1. **Validation des dashboards / règles d'alerte** avant push vers Grafana Cloud (les JSON sont importables tels quels).
2. **Dev/staging local** pour reproduire un incident (charge l'écosystème complet en `up -d`).
3. **Backup** : si Grafana Cloud devient inaccessible, on peut basculer sur cette stack en quelques minutes (à condition de provisionner la VM).

Voir `docs/adr/0002-hosting-choice.md` § Observabilité (à compléter en sprint A.7).

## Alertes par sévérité

| Sévérité | Receiver | Canal | Latence cible | Exemples |
|----------|----------|-------|---------------|----------|
| **P1** | `on-call` | SMS Swisscom + Slack `#incidents` | < 5 min | API down, 5xx > 2%, batch paie échoué, queue > 1000 |
| **P2** | `dev-team` | Slack `#alerts` | < 1 h | latence p95 > 2s, MP CB ouvert, HMAC failure rate > 10% |
| **P3** | `tickets` | Linear (auto-create) | < 1 j | disque > 85%, mémoire > 85%, outbox lag > 15 min |

Le wiring SMS Swisscom (receiver `on-call`) passe par un bridge HTTP custom (`oncall-sms-bridge`), à wire en sprint A.7 — pour l'instant le webhook est documenté mais le service n'existe pas encore.

## Pseudonymisation et conformité nLPD

Tous les logs sont **pseudonymisés source-side** par le logger pino dans `apps/api/src/infrastructure/observability/logger.ts` :

- Champs PII redactés : `iban`, `avs`, `email`, `phone`, `password`, `token`, `firstName`, `lastName`, `fullName`
- Header `Authorization` masqué
- Identifiants workers/missions hashés via `hashWorkerId(id)` (SHA-256 tronqué 16 hex chars)

**Defense-in-depth** : Promtail/Loki ne font PAS de PII processing (la garantie est source-side). Mais si un nouveau champ PII apparaît, il faut l'ajouter à la liste des `redact.paths` du logger ; ne pas compter sur Promtail pour le rattraper.

## Rétention par signal

| Signal | Rétention | Justification |
|--------|-----------|---------------|
| Logs (Loki) | **12 mois** | nLPD : pas plus que nécessaire à la finalité |
| Métriques (Prometheus) | **30 jours** locaux, **13 mois** Grafana Cloud | Capacity planning + audit |
| Traces (Tempo) | **15 jours** | Diagnostic incident, sampling 10% en prod |
| Audit logs métier (`audit_logs` Postgres) | **10 ans** | Obligation légale CO art. 958f |

## Runbooks attachés aux alertes

Chaque alerte critique référence son runbook dans le champ `annotations.runbook`. Voir `docs/runbooks/` :
- `database-down.md`
- `mp-unreachable.md` (lié à `MoveplannerCircuitBreakerOpen`)
- `payroll-batch-failed.md` (lié à `PayrollBatchFailed`)
- `webhook-storm.md` (lié à `WebhookHmacFailureRate`)
- `secret-leaked.md`
- `payment-file-rejected.md`

## Références

- `skills/dev/observability/SKILL.md` — patterns logs/metrics/traces
- `skills/dev/devops-swiss/SKILL.md` — choix Grafana Cloud + DPA EU
- `skills/ops/release-management/SKILL.md` — niveaux P1/P2/P3
- `prompts/sprint-a6-compliance-golive/A6.3-observability-stack.md` — DoD du sprint
