# Runbook — MovePlanner unreachable

> **Sévérité** : P1 (impact métier direct sur synchro disponibilités, push contrats, signature timesheets)
> **Owner** : équipe intégration MP (back-end)
> **Dernière maj** : 2026-04-22

## 1. Déclencheur

Une de ces conditions est observée pendant **plus de 10 minutes** consécutives :

- Métrique Prometheus `mp_cb_state{endpoint="..."} = "open"` (à wirer DETTE-026 ; en attendant, lire les logs `[sentry:error] Circuit breaker '...' opened`).
- Taux d'erreurs > 50 % sur la fenêtre `mp_request_total`.
- Outbox `availability_push` qui empile sans drainer (`status='pending'` croissant, voir requête au §4).

## 2. Diagnostic — 5 minutes

1. **Status page MP** : <https://status.moveplanner.example> — incident publié ?
2. **Réseau / DNS depuis nos pods** :
   ```bash
   kubectl exec deploy/api -- curl -m 5 -I https://api.moveplanner.example/health
   ```
3. **Certificats mTLS** (DETTE-025) :
   ```bash
   openssl x509 -in $MP_MTLS_CERT -noout -dates
   ```
4. **Idempotency keys saturées** : si la table `outbound_idempotency_keys` dépasse 1 million de rows, vérifier le job de purge (TTL 24h).

## 3. Action immédiate

### 3.1 Si MP est down (pas notre faute)

1. **Mettre en pause les push critiques** (flag feature) :
   ```bash
   # Pause availability sync (les rows s'accumulent, on les drainera après recovery)
   kubectl set env deploy/worker AVAILABILITY_SYNC_PAUSED=true
   ```
2. **Communication interne** : poster dans `#interim-ops` :
   > 🚨 MP unreachable depuis HH:MM. Push availability mis en pause. Suivi en cours.
3. **Contact MP** : envoyer e-mail à `partner-support@moveplanner.example` avec :
   - heure de début observée
   - endpoints affectés (cb name)
   - notre `agencyId`
   - ID de corrélation X-Request-Id si dispo
4. **Surveiller** : `mp_cb_state` doit repasser à `closed` dans la prochaine fenêtre de 30s après recovery (resetTimeout = 30s).

### 3.2 Si certificat mTLS expiré

1. Suivre le runbook `cert-rotation.md` (DETTE-025).
2. Recharger le secret côté pods :
   ```bash
   kubectl rollout restart deploy/api deploy/worker
   ```

### 3.3 Si rate limit côté MP (429 persistants)

1. Réduire la concurrence du worker :
   ```bash
   kubectl set env deploy/worker AVAILABILITY_SYNC_CONCURRENCY=1
   ```
2. Augmenter le backoff via env (DETTE-029 — pour l'instant éditer `OUTBOX_BACKOFF_SECONDS` puis redéploy).

## 4. Vérifications

```sql
-- Outbox lag par status
SELECT status, count(*), min(created_at), max(created_at)
FROM outbox_availability_push
GROUP BY status
ORDER BY status;

-- DLQ : rows dead à investiguer
SELECT id, agency_id, worker_id, last_error, attempts, created_at
FROM outbox_availability_push
WHERE status = 'dead'
ORDER BY created_at DESC
LIMIT 50;
```

## 5. Recovery

Quand MP est de nouveau joignable :

1. Vérifier circuit breaker → `half-open` puis `closed` (logs Sentry).
2. Réactiver le push :
   ```bash
   kubectl set env deploy/worker AVAILABILITY_SYNC_PAUSED-
   ```
3. Le worker drain naturellement les rows `pending` (FIFO sur `created_at`).
4. Investigation des rows `dead` : décider replay manuel ou abandon (cf. SLA partenaire MP).

## 6. Post-mortem

Si la panne MP a duré > 1 h, ouvrir un post-mortem dans `docs/post-mortems/YYYY-MM-DD-mp-down.md` avec :
- timeline détaillée
- impact métier (nb missions push perdues, manque à gagner estimé)
- actions correctives (alerting, fallback offline, etc.)

## 7. Références

- ADR-0003 (intégration MovePlanner — à rédiger A.6)
- `apps/api/src/infrastructure/moveplanner/mp-client.ts` (retry + breaker)
- `apps/api/src/infrastructure/reliability/circuit-breaker.ts` (CB hand-rolled)
- `packages/application/src/availability/push-availability.use-case.ts` (drain + DLQ)
- `docs/02-partners-specification.md §7` (contrat MP)
