# Skill — Webhooks MovePlanner (événements entrants)

## Rôle
Intégrateur événementiel. Reçoit les webhooks MP, les vérifie, les persiste, les dispatche.

## Quand l'utiliser
Tout événement en provenance de MovePlanner : `worker.assignment.*`, `timesheet.*`, `invoice.*`, `partner.*`.

## Concepts clés (source : `docs/02-partners-specification.md §7.5`)
- **Endpoint unique** côté agence : `POST https://api.monagence.ch/webhooks/moveplanner`
- **Signature HMAC-SHA256** : header `X-MovePlanner-Signature: sha256={hex}`
- **Timestamp** : header `X-MovePlanner-Timestamp: {epoch_seconds}`, tolérance ±5min
- **Event-Id** : header `X-MovePlanner-Event-Id: {uuid}` — idempotence
- **Event-Type** : header `X-MovePlanner-Event: worker.assignment.proposed` (par exemple)
- **Retry côté MP** : 3 tentatives avec backoff (1s, 30s, 15min), puis abandon

## Événements à traiter

| Événement | Action agence |
|-----------|---------------|
| `worker.assignment.proposed` | Créer `MissionProposal`, router selon mode (pass-through / contrôlé) |
| `worker.assignment.accepted` | Générer `MissionContract`, notifier intérimaire, trigger signature OTP |
| `worker.assignment.refused` | Logger motif, mettre à jour dashboard |
| `worker.assignment.timeout` | Logger, pas de contrat |
| `worker.assignment.replaced` | Alerte gestionnaire |
| `timesheet.draft` | Affichage dashboard |
| `timesheet.ready_for_signature` | Créer tâche de contrôle |
| `timesheet.tacitly_validated` | Fallback si non-signature |
| `invoice.created` | Préparer facture agence à émettre |
| `invoice.paid` | MAJ encaissement |
| `partner.document.expiring` | Alerte gestionnaire |
| `partner.suspended` | STOP push dispos, alerte urgente |

## Règles dures
- **Raw body** conservé avant JSON.parse pour vérification HMAC.
- **Comparaison constant-time**.
- **Persist-first** : écrire dans `inbound_webhook_events` puis 200. Dispatch asynchrone.
- **Idempotence par Event-Id** : contrainte UNIQUE sur `external_event_id`.
- **Tolérance horloge ±5 min** : rejet au-delà (protection replay).

## Architecture

```
MP → POST /webhooks/moveplanner
        ↓ (middleware Express raw body)
      Signature validator (HMAC + timestamp)
        ↓
      Event persister (INSERT inbound_webhook_events)
        ↓ (202 OK / 200)
     BullMQ queue "mp-webhook-dispatch"
        ↓
     Handler par event-type:
       - worker.assignment.proposed → ProposalService.handleProposed()
       - timesheet.ready_for_signature → TimesheetService.prepareReview()
       - ...
```

## Pattern — dispatcher

```typescript
const handlers: Record<string, (payload: any) => Promise<void>> = {
  'worker.assignment.proposed': proposalService.handleProposed.bind(proposalService),
  'worker.assignment.accepted': proposalService.handleAccepted.bind(proposalService),
  'timesheet.ready_for_signature': timesheetService.prepareReview.bind(timesheetService),
  // ...
}

export class WebhookDispatcher {
  async dispatch(eventId: string): Promise<void> {
    const ev = await this.repo.findByExternalId(eventId)
    if (!ev) throw new Error('Event not found')
    if (ev.processedAt) return // déjà traité
    const handler = handlers[ev.eventType]
    if (!handler) {
      await this.repo.markUnknown(eventId)
      logger.warn('mp.webhook.unknown-type', { eventType: ev.eventType })
      return
    }
    try {
      await handler(JSON.parse(ev.rawPayload))
      await this.repo.markProcessed(eventId)
    } catch (e) {
      await this.repo.markError(eventId, String(e))
      throw e // BullMQ retry
    }
  }
}
```

## Pratiques
- **Health check** : `GET /webhooks/moveplanner/_health` retourne `{status: "ok", version: ..., acceptedSigningKeyVersions: [v1, v2]}` pour aider l'équipe MP pendant les rotations.
- **Rotation secret HMAC** : support simultané de 2 secrets (ancien + nouveau) pendant 7 j.
- **DLQ** : événements en erreur après 5 retries → table `inbound_webhook_events_dead_letter`, alerte Slack + ticket.
- **Dashboard monitoring** : nombre d'événements/h, taux de rejet signature, temps de traitement.

## Pièges courants
- Parser JSON avant HMAC → body sérialisé ≠ original. Toujours raw.
- Traiter synchronement dans le handler HTTP → timeout 10s côté MP → 3 retries, 4 traitements réels.
- Ignorer le timestamp → replay attacks facile.
- Oublier qu'un même événement peut arriver **plusieurs fois** (retries MP) — idempotence OBLIGATOIRE.

## Références
- `docs/02-partners-specification.md §7.3`, `§7.5`
- `docs/01-brief.md §5.3`, `§5.5`
- `skills/dev/webhooks-hmac/SKILL.md`
