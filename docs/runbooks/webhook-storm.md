# Runbook — Webhook storm (inbound MP saturé)

> **Sévérité** : 🔴 critical
> **Owner** : équipe back-end + DevOps
> **Cible résolution** : < 15 min (avant épuisement DB connections)
> **Dernière maj** : 2026-04-22

## 1. Déclencheur

Au moins l'un de :
- Alerte AlertManager `inbound_webhook_received_total` rate > 500/min sur 2 min
- Alerte `inbound_webhook_dispatch_duration_seconds_p99 > 5s`
- Alerte `db_connections_in_use > 90% pool` (côté Postgres)
- Sentry pic `WebhookHandlerTimeout` ou `429` retournés à MP
- Lag `inbound_webhook_events.processed = false` qui croît exponentiellement

## 2. Diagnostic — 5 minutes

```bash
# 1. Volume actuel webhook par event-type
kubectl exec -n prod deploy/api -- curl -s localhost:9090/metrics | \
  grep 'inbound_webhook_received_total' | head

# 2. Lag de dispatch
psql -h prod-db -c "
  SELECT event_type, count(*), min(received_at) AS oldest
  FROM inbound_webhook_events
  WHERE processed_at IS NULL
  GROUP BY event_type
  ORDER BY count DESC;
"

# 3. Identifier source IP (sniff replay attack ?)
kubectl logs -n prod deploy/api --tail=500 | \
  grep '/webhooks/moveplanner' | awk '{print $REMOTE_IP}' | sort | uniq -c | sort -rn | head

# 4. Vérifier que le rate limiter IP middleware est en place
grep -r "createWebhookIpRateLimitMiddleware" apps/api/src/main.ts
```

**Diagnostic clé** :
- (a) **Pic légitime** (ex. MP fait un backfill massif après leur incident) → drain accéléré
- (b) **Replay attack / boucle** depuis 1 IP → block temporaire IP
- (c) **DB lente** (pas saturée volume, mais slow queries) → fix index manquant

## 3. Action immédiate

### 3.a Pic légitime — drain accéléré

1. **Augmenter concurrency BullMQ webhook-dispatch** (temporairement) :
   ```bash
   kubectl set env deploy/worker WEBHOOK_DISPATCH_CONCURRENCY=20 -n prod
   kubectl rollout restart deploy/worker -n prod
   ```
2. Surveiller `inbound_webhook_dispatch_duration_seconds` ne pas exploser.
3. Si la file ne diminue pas dans 10 min → scale horizontal :
   ```bash
   kubectl scale deploy/worker --replicas=4 -n prod
   ```
4. Quand stabilisé : revenir aux valeurs nominales (CONCURRENCY=4, replicas=2).

### 3.b Replay attack / boucle depuis 1 IP

1. **Block immédiat** au niveau ingress :
   ```bash
   # Cloud Armor (GCP) ou Infomaniak WAF
   gcloud compute security-policies rules create 1000 \
     --security-policy=interim-prod-policy \
     --action=deny-403 \
     --src-ip-ranges="<IP_OFFENDER>/32"
   ```
2. **Notifier sécurité** : `#security` Slack avec IP, volume, event-types.
3. **Vérifier intégrité HMAC** : `psql -c "SELECT count(*) FROM inbound_webhook_events WHERE hmac_valid=false AND received_at > now()-interval '1h'"` — si > 0, c'est confirmé attaque externe.
4. Si HMAC valides → c'est MP qui boucle, alerter MP support.

### 3.c DB lente

1. Identifier slow queries :
   ```bash
   psql -h prod-db -c "
     SELECT query, calls, mean_exec_time
     FROM pg_stat_statements
     WHERE query LIKE '%inbound_webhook%'
     ORDER BY mean_exec_time DESC
     LIMIT 10;
   "
   ```
2. Vérifier index sur `(event_id)` UNIQUE et `(processed_at)` partial :
   ```sql
   \d inbound_webhook_events
   -- Doit avoir : idx_inbound_event_id (UNIQUE), idx_pending_partial WHERE processed_at IS NULL
   ```
3. Si index manquants → coordination DBA + REINDEX off-hours.

## 4. Mesures de protection à activer

Si la cause = (a) ou (c) et que ça risque de se reproduire :

```bash
# Réduire le seuil rate-limit IP webhook (default 100/min/IP)
kubectl set env deploy/api WEBHOOK_IP_RATE_LIMIT_PER_MIN=60 -n prod

# Activer outbox dispatcher idempotency stricte (rejet immédiat dup eventId)
# Déjà en place via inbound_webhook_events PRIMARY KEY (event_id)
```

## 5. Vérifications

```bash
# Lag webhook revient à <100 events
psql -c "SELECT count(*) FROM inbound_webhook_events WHERE processed_at IS NULL"

# p99 dispatch < 1s
curl -s prod-api/metrics | grep dispatch_duration_seconds | grep p99

# DB connections retombent < 50%
curl -s prod-db-exporter/metrics | grep pg_stat_database_numbackends
```

## 6. Post-mortem

Si > 100 events ont raté leur SLA traitement (5 min) :
- Identifier missions/timesheets/contracts impactés
- Communication MP : confirmer qu'aucun event n'est perdu (DLQ vérifiée)
- Document `docs/runbooks/postmortems/YYYY-MM-DD-webhook-storm.md`

## 7. Références

- `apps/api/src/infrastructure/webhooks/ip-rate-limit.ts` (middleware bucket per IP)
- `apps/api/src/infrastructure/webhooks/moveplanner-webhook.controller.ts` (HMAC + persistence)
- `packages/application/src/webhooks/dispatch-inbound-webhook.use-case.ts` (idempotency)
- `apps/worker/src/webhook-dispatch.worker.ts` (BullMQ consumer)
