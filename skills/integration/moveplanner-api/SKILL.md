# Skill — Intégration API MovePlanner (appels sortants)

## Rôle
Intégrateur responsable du client API vers MovePlanner. Garantit les appels fiables, idempotents, signés, observables.

## Quand l'utiliser
Tout appel sortant depuis notre agence vers `api.moveplanner.ch/api/v1/...` : déclaration worker, push dispo, accept/refus affectation, sign/dispute timesheet, lecture factures.

## Concepts clés (source : `docs/02-partners-specification.md §7`)
- **Base URL** : `https://api.moveplanner.ch/api/v1`
- **Auth** : mTLS (certificat client émis par MP) + `Authorization: Bearer {api_key}`
- **Rotation clé** : tous les 90 jours, grace 7 j où deux clés acceptées
- **Rate limit** : 100 req/min, 1000 req/jour par `partnerId`
- **Idempotency** : header `Idempotency-Key` UUID v4 obligatoire sur POST/PUT
- **Versioning** : `/v1/` — si MP publie `v2`, migration par ADR

## Règles dures
- **Client HTTP typé** généré depuis l'OpenAPI fourni par MP (`openapi-typescript` ou `orval`).
- **Idempotency** : UUID v4 persisté dans table `outbound_idempotency_keys` avec `endpoint`, `payload_hash`, `response_snapshot`, `created_at`, `status`. Rejeu identique = retourne la réponse snapshot.
- **Retry** : backoff exponentiel (1s, 5s, 15s, 60s, 5min) uniquement sur 5xx et timeouts. Pas de retry sur 4xx.
- **Circuit breaker** : opossum, ouverture si 50% erreurs sur 10 requêtes, half-open après 30s.
- **Observabilité** : chaque appel logge `{partnerId, endpoint, method, status, duration_ms, idempotency_key}` structuré, avec tracing OpenTelemetry span.
- **Secrets** : clé API et cert mTLS dans secret manager. Reload à chaud lors de la rotation.

## Endpoints à implémenter

| Méthode | Endpoint | Use case interne |
|---------|----------|------------------|
| POST | `/partners/{id}/workers` | Déclarer/MAJ un intérimaire |
| DELETE | `/partners/{id}/workers/{staffId}` | Retirer un intérimaire |
| POST | `/partners/{id}/workers/{staffId}/availability` | Push dispos |
| POST | `/partners/{id}/workers/{staffId}/unavailable` | Indispo immédiate |
| POST | `/partners/{id}/assignments/{requestId}/response` | Accept/refus mission |
| POST | `/partners/{id}/timesheets/{timesheetId}/sign` | Signer relevé |
| POST | `/partners/{id}/timesheets/{timesheetId}/dispute` | Contester relevé |
| GET | `/partners/{id}/timesheets` | Lister relevés |
| GET | `/partners/{id}/assignments` | Lister affectations |
| GET | `/partners/{id}/invoices` | Lister factures achat |

## Pattern — client

```typescript
// infrastructure/moveplanner/client.ts
import { Agent, request } from 'undici'
import { randomUUID } from 'node:crypto'
import CircuitBreaker from 'opossum'

export class MovePlannerClient {
  private agent: Agent
  constructor(private cfg: { baseUrl: string; apiKey: string; cert: Buffer; key: Buffer }) {
    this.agent = new Agent({ connect: { cert: cfg.cert, key: cfg.key } })
  }

  async pushAvailability(partnerId: string, staffId: string, body: AvailabilityBody): Promise<Result<PushOk, PushErr>> {
    const idempotencyKey = randomUUID()
    const url = `${this.cfg.baseUrl}/partners/${partnerId}/workers/${staffId}/availability`

    const call = async () => {
      const res = await request(url, {
        method: 'POST', dispatcher: this.agent,
        headers: {
          Authorization: `Bearer ${this.cfg.apiKey}`,
          'Idempotency-Key': idempotencyKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      if (res.statusCode >= 500) throw new TransientError(`MP ${res.statusCode}`)
      if (res.statusCode === 429) throw new RateLimitError()
      const payload = await res.body.json()
      if (res.statusCode >= 400) return err({ kind: 'ClientError', status: res.statusCode, payload })
      return ok(payload as PushOk)
    }

    const breaker = new CircuitBreaker(call, { timeout: 10_000, errorThresholdPercentage: 50, resetTimeout: 30_000 })
    return breaker.fire()
  }
}
```

## Pratiques
- **Outbox pattern** : insert outbox row dans la transaction métier (ex. commit `WorkerAvailabilityChanged`) + worker BullMQ qui dépile et appelle l'API.
- **Rotation clé API** : job manuel (semi-auto) — demande de nouvelle clé via MP API, bascule progressive pendant 7j, stockage dans secret manager.
- **Health check** : ping `GET /api/v1/partners/{id}/_health` toutes les 5 min, métrique `mp_health_ok`.
- **Métriques Prometheus** : `mp_request_total{endpoint,status}`, `mp_request_duration_seconds_bucket{endpoint}`, `mp_circuit_breaker_state{endpoint}`.

## Pièges courants
- Retry sur 4xx (payload invalide) → MP reçoit 100x le même payload cassé. Retry uniquement 5xx + réseau.
- Pas de persistance idempotency → double écriture côté MP sur reprise après crash.
- Ignorer rate limit → blacklist temporaire par MP. Respecter `X-RateLimit-Remaining`.
- Hardcoder base URL. Toujours via config.

## Références
- `docs/02-partners-specification.md §7`
- `docs/01-brief.md §5`
- `skills/dev/security-hardening/SKILL.md`
- `skills/dev/webhooks-hmac/SKILL.md` (pour la contrepartie entrante)
