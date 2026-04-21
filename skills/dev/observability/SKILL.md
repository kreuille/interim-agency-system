# Skill — Observabilité (Sentry + Grafana + OpenTelemetry)

## Rôle
Ingénieur observabilité / SRE. Rend le système lisible en prod : logs, métriques, traces, alertes, dashboards.

## Quand l'utiliser
Tout prompt qui ajoute un endpoint critique, un job, une intégration externe. Prompt A6.3 en priorité.

## Concepts clés — les 3 piliers
- **Logs** structurés (JSON), requêtables. On cherche "que s'est-il passé pour X ?".
- **Métriques** numériques agrégées (RED = Rate, Errors, Duration ; USE = Utilization, Saturation, Errors). On cherche "la tendance".
- **Traces** distribuées (OpenTelemetry) reliant un request HTTP à tous ses sous-appels (DB, queue, HTTP externe). On cherche "où passe le temps".

## Règles dures
- **JSON structuré** partout (pino côté Node). Jamais de `console.log` en prod.
- **Pseudonymisation** : workerId hashé, nom masqué, email masqué. Pas de PII en clair dans les logs (nLPD).
- **Correlation ID** : un header `X-Request-Id` traversant tous les services et toutes les lignes de logs.
- **Sampling traces** : 10% prod, 100% dev/staging. Augmenter temporairement si incident.
- **Rétention logs** : 12 mois max (nLPD) ; métriques 13 mois ; traces 15 jours.

## Stack recommandée (voir `skills/dev/devops-swiss/SKILL.md`)
- **Sentry (région EU)** : erreurs côté API + front, releases taguées, sourcemaps uploadées CI.
- **Grafana Cloud** : logs (Loki), métriques (Prometheus / Mimir), traces (Tempo), dashboards unifiés.
- **OpenTelemetry SDK Node** : instrumentation auto (Express, Prisma, Undici, BullMQ).

## Dashboards prioritaires
1. **API health** : QPS, latence p50/p95/p99, taux 5xx, par endpoint.
2. **MP health** : push success rate, latence, circuit breaker state, outbox lag.
3. **Webhooks entrants** : ingest rate, signature failure rate, DLQ depth.
4. **Paie hebdo** : batch duration, workers affectés, erreurs par étape.
5. **Queue BullMQ** : jobs en attente, en cours, failed, DLQ par queue.
6. **Auth** : login success/fail, MFA enrolments, tokens refresh.

## Alertes prioritaires (P1 = on-call)
- API 5xx > 2% pendant 5 min
- API p95 > 2s pendant 10 min
- MP circuit breaker open > 10 min
- Outbox lag > 15 min
- Batch paie hebdo failed
- Webhook signature failure rate > 10% pendant 5 min (signale compromission ou rotation mal faite)
- Disque > 85% plein

## Pattern — logging

```typescript
import pino from 'pino'
export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  formatters: { level: (label) => ({ level: label }) },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: { paths: ['req.headers.authorization', '*.iban', '*.avs', '*.email'], censor: '[REDACTED]' },
})
// usage
logger.info({ correlationId, workerIdHash, action: 'availability.pushed' }, 'availability pushed to MP')
```

## Pattern — tracing

```typescript
import { trace } from '@opentelemetry/api'
const tracer = trace.getTracer('api')

await tracer.startActiveSpan('mp.availability.push', async (span) => {
  span.setAttribute('worker.id.hash', hashId(workerId))
  span.setAttribute('slot.count', slots.length)
  try {
    const res = await client.push(...)
    span.setAttribute('http.status', res.status)
    return res
  } catch (e) {
    span.recordException(e as Error)
    throw e
  } finally {
    span.end()
  }
})
```

## Pièges courants
- Log verbeux en prod (level=debug) → coût explosif en stockage, PII leaks.
- Métriques haute cardinalité (ex. `workerId` comme label) → explosion de séries Prometheus.
- Dashboards "mur de graphiques" sans story → personne ne les ouvre.
- Alertes trop sensibles → fatigue d'alerte → on ignore → incident réel manqué.
- Pas de runbook attaché à chaque alerte → réveil nocturne inutile.

## Références
- Google SRE book — chapitre Monitoring
- https://grafana.com/oss/
- https://opentelemetry.io/docs/
- `skills/dev/devops-swiss/SKILL.md`, `skills/ops/release-management/SKILL.md`
