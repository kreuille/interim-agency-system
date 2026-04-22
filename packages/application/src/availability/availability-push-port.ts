import type { AgencyId, StaffId } from '@interim/domain';
import type { Result } from '@interim/shared';
import type { AvailabilityPushPayload } from './availability-outbox.js';

/**
 * Erreurs renvoyées par l'adaptateur de push (en pratique, mappage du
 * `MpError` côté infra `apps/api/src/infrastructure/moveplanner`).
 */
export type AvailabilityPushErrorKind = 'transient' | 'permanent';

export class AvailabilityPushError extends Error {
  constructor(
    public readonly kind: AvailabilityPushErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'AvailabilityPushError';
  }
}

/**
 * Port d'application pour pousser un batch de slots vers MovePlanner.
 * Le `idempotencyKey` est passé tel quel à l'adapter HTTP, qui le passe
 * à son tour en `Idempotency-Key` header MP. Côté infra, voir
 * `apps/api/src/infrastructure/moveplanner/adapters/availability-push.adapter.ts`.
 */
export interface AvailabilityPushPort {
  push(input: {
    readonly agencyId: AgencyId;
    readonly workerId: StaffId;
    readonly idempotencyKey: string;
    readonly payload: AvailabilityPushPayload;
  }): Promise<
    Result<{ readonly accepted: number; readonly rejected: number }, AvailabilityPushError>
  >;
}
