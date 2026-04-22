import type { Result } from '@interim/shared';

/**
 * Port outbound pour notifier MovePlanner de la décision agence sur
 * une proposition. L'adapter HTTP correspond à
 * `apps/api/src/infrastructure/moveplanner/adapters/assignment-response.adapter.ts`
 * (créé en A2.4).
 *
 * Les transient errors retournées ici (réseau, 5xx) sont rejouées par
 * BullMQ avec backoff. Permanent errors (4xx hors 429) → marquage
 * dead-letter et alerte (DETTE-029).
 */

export type ProposalMpErrorKind = 'transient' | 'permanent';

export class ProposalMpError extends Error {
  constructor(
    public readonly kind: ProposalMpErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ProposalMpError';
  }
}

export interface ProposalMpResponsePort {
  notifyAccepted(input: {
    readonly externalRequestId: string;
    readonly idempotencyKey: string;
    readonly notes?: string;
  }): Promise<Result<{ readonly recorded: true }, ProposalMpError>>;

  notifyRefused(input: {
    readonly externalRequestId: string;
    readonly idempotencyKey: string;
    readonly reason: string;
    readonly counterproposal?: { readonly dateFrom: string; readonly dateTo: string };
  }): Promise<Result<{ readonly recorded: true }, ProposalMpError>>;
}
