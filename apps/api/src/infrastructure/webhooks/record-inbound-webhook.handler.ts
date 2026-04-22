import type { AgencyId } from '@interim/domain';
import type { RecordInboundWebhookUseCase } from '@interim/application';
import type { MoveplannerWebhookHandler } from './moveplanner-webhook.controller.js';

/**
 * Adapter HTTP → application : appelle `RecordInboundWebhookUseCase`
 * avec les données extraites du webhook HMAC-vérifié.
 *
 * Single-tenant pour MVP : `agencyId` injecté à la construction. Pour
 * du multi-tenant (plusieurs agences pointant vers la même API), la
 * stratégie sera de :
 *   - mapper l'URL `/webhooks/moveplanner/<agencyId>` (path param), ou
 *   - lire le secret partagé et résoudre l'agency par sa version, ou
 *   - extraire l'agencyId du payload (moins sûr, à valider).
 * → DETTE-034 quand on accueille plusieurs tenants en parallèle.
 */
export class RecordInboundWebhookHandler implements MoveplannerWebhookHandler {
  constructor(
    private readonly agencyId: AgencyId,
    private readonly useCase: RecordInboundWebhookUseCase,
  ) {}

  async handle(input: {
    eventId: string;
    eventType: string;
    timestamp: string;
    signature: string;
    secretVersion: 'current' | 'previous';
    payload: unknown;
  }): Promise<void> {
    await this.useCase.execute({
      agencyId: this.agencyId,
      eventId: input.eventId,
      eventType: input.eventType,
      signature: input.signature,
      payload: input.payload,
      headers: {
        'x-moveplanner-event-id': input.eventId,
        'x-moveplanner-event-type': input.eventType,
        'x-moveplanner-timestamp': input.timestamp,
        'x-moveplanner-signature': input.signature,
        'x-moveplanner-secret-version': input.secretVersion,
      },
    });
  }
}
