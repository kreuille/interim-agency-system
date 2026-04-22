import {
  asMissionProposalId,
  type AgencyId,
  type MissionProposalRepository,
} from '@interim/domain';
import type { Clock } from '@interim/shared';
import type { SendSmsUseCase } from '../sms/send-sms.use-case.js';

/**
 * Use case appelé par le worker BullMQ delayed `proposal-reminder`
 * (planifié à T = deadline - 50% du délai restant après envoi initial
 * pass-through).
 *
 * Comportement :
 *   - Si la proposition est déjà terminale ou plus à pass_through_sent
 *     → no-op (intérimaire a déjà répondu, plus besoin de rappel).
 *   - Sinon : envoie un SMS de rappel (template `proposal-reminder`) au
 *     numéro `phoneE164` connu côté caller (pas de lookup Worker ici
 *     pour respecter l'isolation domain — le caller fournit le numéro).
 *
 * Idempotent : peut être rejoué (BullMQ garantit at-least-once). Le
 * compteur SMS rate-limit empêchera la duplication massive.
 */
export interface SendProposalReminderInput {
  readonly agencyId: AgencyId;
  readonly proposalId: string;
  readonly phoneE164: string;
  readonly templateCode?: string;
  readonly variables?: Readonly<Record<string, unknown>>;
}

export type SendProposalReminderResult =
  | { readonly status: 'sent'; readonly logId: string }
  | { readonly status: 'skipped_terminal' }
  | { readonly status: 'skipped_state'; readonly currentState: string }
  | { readonly status: 'proposal_not_found' };

export class SendProposalReminderUseCase {
  constructor(
    private readonly proposals: MissionProposalRepository,
    private readonly sms: SendSmsUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(input: SendProposalReminderInput): Promise<SendProposalReminderResult> {
    const proposal = await this.proposals.findById(
      input.agencyId,
      asMissionProposalId(input.proposalId),
    );
    if (!proposal) return { status: 'proposal_not_found' };
    if (proposal.isTerminal) return { status: 'skipped_terminal' };
    if (proposal.state !== 'pass_through_sent') {
      return { status: 'skipped_state', currentState: proposal.state };
    }
    void this.clock; // unused for now; kept for future "expire if too late" logic
    const snap = proposal.toSnapshot();
    const result = await this.sms.execute({
      agencyId: input.agencyId,
      to: input.phoneE164,
      templateCode: input.templateCode ?? 'proposal-reminder',
      variables: input.variables ?? {
        clientName: snap.missionSnapshot.clientName,
        startDate: snap.missionSnapshot.startsAt.toISOString().slice(0, 10),
      },
    });
    if (!result.ok) {
      throw new Error(`reminder_sms_failed: ${result.error.kind}`);
    }
    return { status: 'sent', logId: result.value.logId };
  }
}

/**
 * Calcule le délai BullMQ avant rappel : 50% du temps restant entre
 * `sentAt` et `deadline`. Renvoie `undefined` si la deadline est déjà
 * dépassée ou trop proche (< 60s).
 */
export function computeReminderDelayMs(input: {
  readonly sentAt: Date;
  readonly deadline: Date;
  readonly nowMs?: number;
}): number | undefined {
  const now = input.nowMs ?? Date.now();
  const remaining = input.deadline.getTime() - now;
  if (remaining <= 60_000) return undefined;
  // Half of remaining = délai avant rappel
  return Math.floor(remaining / 2);
}
