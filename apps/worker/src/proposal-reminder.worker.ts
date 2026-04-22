import { Queue, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { SendProposalReminderUseCase } from '@interim/application';

export const PROPOSAL_REMINDER_QUEUE_NAME = 'proposal-reminder';

export interface ProposalReminderJob {
  readonly agencyId: string;
  readonly proposalId: string;
  readonly phoneE164: string;
}

export interface ProposalReminderWorkerDeps {
  readonly connection: Redis;
  readonly useCase: SendProposalReminderUseCase;
  readonly concurrency?: number;
}

/**
 * Consumer BullMQ pour `proposal-reminder`. Délai planifié à T = deadline - 50%
 * via `queue.add(name, payload, { delay })` côté caller (cf.
 * `enqueueProposalReminder`).
 */
export function createProposalReminderWorker(
  deps: ProposalReminderWorkerDeps,
): Worker<ProposalReminderJob> {
  return new Worker<ProposalReminderJob>(
    PROPOSAL_REMINDER_QUEUE_NAME,
    async (job: Job<ProposalReminderJob>) => {
      return deps.useCase.execute({
        agencyId: job.data.agencyId as never,
        proposalId: job.data.proposalId,
        phoneE164: job.data.phoneE164,
      });
    },
    {
      connection: deps.connection,
      concurrency: deps.concurrency ?? 4,
    },
  );
}

export function createProposalReminderQueue(connection: Redis): Queue<ProposalReminderJob> {
  return new Queue<ProposalReminderJob>(PROPOSAL_REMINDER_QUEUE_NAME, { connection });
}

/**
 * Helper côté caller : planifie un job delayed pour rappeler l'intérimaire
 * à T = deadline - 50%. À appeler après l'envoi initial du SMS pass-through.
 *
 * Si le délai est invalide (deadline trop proche ou passée), no-op.
 */
export async function enqueueProposalReminder(
  queue: Queue<ProposalReminderJob>,
  input: {
    readonly proposalId: string;
    readonly agencyId: string;
    readonly phoneE164: string;
    readonly delayMs: number;
  },
): Promise<void> {
  await queue.add(
    PROPOSAL_REMINDER_QUEUE_NAME,
    {
      agencyId: input.agencyId,
      proposalId: input.proposalId,
      phoneE164: input.phoneE164,
    },
    {
      jobId: `reminder-${input.proposalId}`, // évite doublon si rejoué
      delay: input.delayMs,
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  );
}
