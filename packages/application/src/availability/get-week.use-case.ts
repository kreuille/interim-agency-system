import type { AgencyId, ExpandedInstance, Freshness, StaffId } from '@interim/domain';
import type { Clock } from '@interim/shared';
import type { WorkerAvailabilityRepository } from './availability-ports.js';

export interface GetWeekInput {
  readonly agencyId: AgencyId;
  readonly workerId: StaffId;
  /** Lundi de la semaine ISO recherchée (00:00 UTC). */
  readonly weekStart: Date;
}

export interface WeekView {
  readonly weekStart: Date;
  readonly weekEnd: Date;
  readonly instances: readonly ExpandedInstance[];
  readonly freshness: Freshness;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

export class GetWeekAvailabilityUseCase {
  constructor(
    private readonly repo: WorkerAvailabilityRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: GetWeekInput): Promise<WeekView> {
    const weekEnd = new Date(input.weekStart.getTime() + WEEK_MS);
    const agg = await this.repo.findByWorker(input.agencyId, input.workerId);
    if (!agg) {
      return {
        weekStart: input.weekStart,
        weekEnd,
        instances: [],
        freshness: 'stale',
      };
    }
    const instances = agg.effectiveInstances(input.weekStart, weekEnd);
    return {
      weekStart: input.weekStart,
      weekEnd,
      instances,
      freshness: agg.freshness(this.clock),
    };
  }
}
