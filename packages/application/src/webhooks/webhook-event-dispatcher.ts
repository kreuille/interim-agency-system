/**
 * Routing par event-type vers un handler dédié.
 *
 * Convention de nommage MP : `worker.assignment.proposed`,
 * `timesheet.signed`, `invoice.paid`, etc. Voir
 * `docs/02-partners-specification.md §7`.
 *
 * Chaque handler reçoit le payload typé `unknown` et doit valider
 * (Zod recommandé) puis appliquer son use case. Idempotent : peut être
 * rejoué.
 */

export interface InboundWebhookContext {
  readonly eventId: string;
  readonly eventType: string;
  readonly timestamp: string;
  readonly payload: unknown;
}

export interface InboundWebhookHandler {
  handle(ctx: InboundWebhookContext): Promise<void>;
}

export class UnknownEventTypeError extends Error {
  constructor(eventType: string) {
    super(`No handler registered for event type "${eventType}"`);
    this.name = 'UnknownEventTypeError';
  }
}

/**
 * Registry simple : `Map<eventType, handler>`. Si l'event-type n'a pas
 * de handler, on **réussit silencieusement** (l'event est marqué
 * processed). Cela permet à MP de pousser des event-types qu'on ne
 * consomme pas encore sans planter le worker.
 *
 * Pour les events critiques, enregistrer un handler explicite. Pour les
 * events à ignorer activement, enregistrer un `NoOpHandler`.
 */
export class InboundWebhookDispatcher {
  private readonly handlers = new Map<string, InboundWebhookHandler>();

  register(eventType: string, handler: InboundWebhookHandler): void {
    this.handlers.set(eventType, handler);
  }

  has(eventType: string): boolean {
    return this.handlers.has(eventType);
  }

  async dispatch(ctx: InboundWebhookContext): Promise<{ readonly handled: boolean }> {
    const handler = this.handlers.get(ctx.eventType);
    if (!handler) return { handled: false };
    await handler.handle(ctx);
    return { handled: true };
  }
}

/**
 * Handler no-op pour les event-types reconnus mais ignorés volontairement.
 */
export class NoOpInboundHandler implements InboundWebhookHandler {
  handle(): Promise<void> {
    return Promise.resolve();
  }
}
