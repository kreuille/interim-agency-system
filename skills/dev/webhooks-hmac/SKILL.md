# Skill — Webhooks et signatures HMAC

## Rôle
Intégrateur événementiel. Produit et consomme des webhooks robustes (signés, idempotents, rejouables).

## Quand l'utiliser
Tout endpoint `/webhooks/...` entrant ou toute émission d'événement sortant vers MovePlanner / autre client.

## Concepts clés
- **HMAC-SHA256** sur le raw body concaténé au timestamp : `signature = HMAC(secret, timestamp + "." + rawBody)`.
- **Tolérance horloge ±5 min** pour bloquer les rejeux tardifs.
- **Idempotence** par `Event-Id` côté consommateur : si déjà traité, 200 sans rerunner.
- **Outbox pattern** côté émetteur : écriture en base dans la même transaction que la mutation métier, puis un worker publie.

## Règles dures
- Toujours lire le **raw body** (pas JSON.parse) avant vérification HMAC. Express : `bodyParser.raw({ type: 'application/json' })` sur le path webhook.
- Comparaison de signature en **constant-time** (`crypto.timingSafeEqual`).
- **Persister l'event** avant de le traiter. La logique métier tourne dans un worker, pas dans le handler HTTP. Le handler HTTP répond 200 dès que l'event est persisté (acknowledge rapide).
- Retry côté émetteur : backoff exponentiel (1s, 30s, 15min, 1h, 6h, 24h) puis mort-lettre.
- DLQ (dead letter queue) obligatoire. Alerte si > 5 events en DLQ.

## Pratiques
- Table `inbound_webhook_events` : `id`, `source`, `event_type`, `external_event_id UNIQUE`, `raw_payload JSONB`, `received_at`, `processed_at NULLABLE`, `error TEXT NULLABLE`, `attempts`.
- Table `outbound_webhook_events` côté émetteur : pareil mais avec `target_url`, `status`, `last_attempt_at`, `next_attempt_at`.
- Signature rotation 90 j. Grace period de 7 j où les deux secrets sont acceptés.
- Health check webhook : endpoint `/webhooks/moveplanner/_health` qui retourne 200, utilisé par MP pour valider la configuration.

## Pattern — handler Express

```typescript
app.post(
  '/webhooks/moveplanner',
  express.raw({ type: 'application/json', limit: '256kb' }),
  async (req, res) => {
    const sig = req.header('X-MovePlanner-Signature') ?? ''
    const ts = req.header('X-MovePlanner-Timestamp') ?? ''
    const evId = req.header('X-MovePlanner-Event-Id') ?? ''
    const evType = req.header('X-MovePlanner-Event') ?? ''

    if (!verifyWebhookSignature(req.body, sig, ts, secret)) {
      logger.warn('webhook.hmac.invalid', { evId, evType })
      return res.status(401).json({ error: 'invalid signature' })
    }
    try {
      const { inserted } = await webhookRepo.insertIfNew({
        externalEventId: evId,
        eventType: evType,
        rawPayload: req.body,
        receivedAt: new Date(),
      })
      // toujours 200 : l'insertion idempotente suffit pour ACK
      res.status(200).json({ ok: true, new: inserted })
      if (inserted) await dispatcher.enqueue(evId)
    } catch (e) {
      logger.error('webhook.persist.failed', { err: e })
      res.status(500).json({ error: 'persist failed' })
    }
  }
)
```

## Pièges courants
- Parser JSON **avant** la vérification HMAC → body serialization diverge, signature fausse. Toujours raw.
- Traiter l'event synchronement → timeouts côté émetteur, retries massifs. Persister puis dispatcher.
- Oublier la table d'idempotence → doublons de traitement (ex. 2 contrats générés pour la même acceptation).
- Ignorer le timestamp → replay attacks triviaux.
- DLQ jamais consultée. Prévoir un dashboard et un alerting.

## Références
- `docs/02-partners-specification.md §7.5`
- `skills/dev/security-hardening/SKILL.md`
- https://webhooks.fyi/
