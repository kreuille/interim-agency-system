import { z } from 'zod';
import type { AgencyId } from '@interim/domain';
import type {
  InboundWebhookContext,
  InboundWebhookHandler,
} from '../webhooks/webhook-event-dispatcher.js';
import type { RecordMissionProposalUseCase } from './record-mission-proposal.use-case.js';

/**
 * Handler pour l'event MovePlanner `worker.assignment.proposed`.
 *
 * Schéma payload (cf. `docs/02-partners-specification.md §5.1`) :
 * ```
 * {
 *   externalRequestId: string,
 *   workerId: string | null,           // staff ID local si MP connaît, sinon null
 *   clientId: string | null,
 *   mission: { ... }
 * }
 * ```
 *
 * Validation Zod stricte : tout schéma invalide → throw, dispatcher
 * marque l'event en FAILED + retry. C'est volontaire : un payload
 * inattendu indique un bug de schéma côté MP qu'il faut investiguer
 * (DLQ + alerte plutôt que perte silencieuse).
 */

const PayloadSchema = z.object({
  externalRequestId: z.string().min(1),
  workerId: z.string().min(1).nullable().optional(),
  clientId: z.string().min(1).nullable().optional(),
  mission: z.object({
    title: z.string().min(1),
    clientName: z.string().min(1),
    siteAddress: z.string().min(1),
    canton: z.string().length(2),
    cctReference: z.string().optional(),
    hourlyRateRappen: z.number().int().positive(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    skillsRequired: z.array(z.string()).default([]),
    raw: z.record(z.unknown()).optional(),
  }),
  responseDeadline: z.string().datetime().optional(),
});

export class WorkerAssignmentProposedHandler implements InboundWebhookHandler {
  constructor(
    private readonly agencyId: AgencyId,
    private readonly useCase: RecordMissionProposalUseCase,
  ) {}

  async handle(ctx: InboundWebhookContext): Promise<void> {
    const parsed = PayloadSchema.parse(ctx.payload);
    const result = await this.useCase.execute({
      agencyId: this.agencyId,
      externalRequestId: parsed.externalRequestId,
      ...(parsed.workerId ? { workerId: parsed.workerId as never } : {}),
      ...(parsed.clientId ? { clientId: parsed.clientId as never } : {}),
      missionSnapshot: {
        title: parsed.mission.title,
        clientName: parsed.mission.clientName,
        siteAddress: parsed.mission.siteAddress,
        canton: parsed.mission.canton,
        ...(parsed.mission.cctReference !== undefined
          ? { cctReference: parsed.mission.cctReference }
          : {}),
        hourlyRateRappen: parsed.mission.hourlyRateRappen,
        startsAt: new Date(parsed.mission.startsAt),
        endsAt: new Date(parsed.mission.endsAt),
        skillsRequired: parsed.mission.skillsRequired,
        ...(parsed.mission.raw !== undefined ? { raw: parsed.mission.raw } : {}),
      },
      proposedAt: new Date(ctx.timestamp),
      ...(parsed.responseDeadline !== undefined
        ? { responseDeadline: new Date(parsed.responseDeadline) }
        : {}),
    });
    if (!result.ok) {
      throw new Error('record_mission_proposal_failed');
    }
  }
}
