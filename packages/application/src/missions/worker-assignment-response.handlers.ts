import { z } from 'zod';
import type { AgencyId, MissionProposalRepository, ProposalState } from '@interim/domain';
import type { Clock } from '@interim/shared';
import type {
  InboundWebhookContext,
  InboundWebhookHandler,
} from '../webhooks/webhook-event-dispatcher.js';

/**
 * Handlers pour les events MP qui notifient une décision côté MP/intérimaire :
 *  - `worker.assignment.accepted`  → transition `→ accepted`
 *  - `worker.assignment.refused`   → transition `→ refused`
 *  - `worker.assignment.timeout`   → transition `→ timeout`
 *  - `worker.assignment.expired`   → transition `→ expired`
 *
 * Idempotents : si la proposal est déjà à l'état cible (rejeu MP), no-op.
 * Si la transition n'est pas valide depuis l'état courant
 * (ex. accepted reçu alors qu'on est déjà refused), throw → DLQ.
 */

const PayloadSchema = z.object({
  externalRequestId: z.string().min(1),
  reason: z.string().optional(),
});

abstract class BaseAssignmentResponseHandler implements InboundWebhookHandler {
  constructor(
    protected readonly agencyId: AgencyId,
    protected readonly repo: MissionProposalRepository,
    protected readonly clock: Clock,
  ) {}

  protected abstract targetState(): ProposalState;

  async handle(ctx: InboundWebhookContext): Promise<void> {
    const parsed = PayloadSchema.parse(ctx.payload);
    const proposal = await this.repo.findByExternalRequestId(
      this.agencyId,
      parsed.externalRequestId,
    );
    if (!proposal) {
      // Proposition inconnue côté agence : ignore silencieusement (peut arriver
      // si MP rejoue un event que l'agence n'a jamais reçu en proposed).
      return;
    }
    const target = this.targetState();
    if (proposal.state === target) return; // idempotent
    if (proposal.isTerminal) {
      // Déjà dans un autre état terminal : conflit → throw pour DLQ + investigation.
      throw new Error(`proposal_already_terminal: state=${proposal.state}, attempted=${target}`);
    }
    proposal.transitionTo(
      target,
      parsed.reason !== undefined ? { reason: parsed.reason } : {},
      this.clock,
    );
    await this.repo.save(proposal);
  }
}

export class WorkerAssignmentAcceptedHandler extends BaseAssignmentResponseHandler {
  protected targetState(): ProposalState {
    return 'accepted';
  }
}

export class WorkerAssignmentRefusedHandler extends BaseAssignmentResponseHandler {
  protected targetState(): ProposalState {
    return 'refused';
  }
}

export class WorkerAssignmentTimeoutHandler extends BaseAssignmentResponseHandler {
  protected targetState(): ProposalState {
    return 'timeout';
  }
}

export class WorkerAssignmentExpiredHandler extends BaseAssignmentResponseHandler {
  protected targetState(): ProposalState {
    return 'expired';
  }
}
