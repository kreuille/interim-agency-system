import type {
  AgencyId,
  StaffId,
  Timesheet,
  TimesheetId,
  TimesheetRepository,
} from '@interim/domain';

/**
 * Repository in-memory pour Timesheet. Multi-tenant strict.
 */
export class InMemoryTimesheetRepository implements TimesheetRepository {
  private readonly byId = new Map<string, Timesheet>();

  save(timesheet: Timesheet): Promise<void> {
    this.byId.set(timesheet.id, timesheet);
    return Promise.resolve();
  }

  findById(agencyId: AgencyId, id: TimesheetId): Promise<Timesheet | undefined> {
    const t = this.byId.get(id);
    if (t?.agencyId !== agencyId) return Promise.resolve(undefined);
    return Promise.resolve(t);
  }

  findByExternalId(agencyId: AgencyId, externalId: string): Promise<Timesheet | undefined> {
    for (const t of this.byId.values()) {
      const s = t.toSnapshot();
      if (s.agencyId === agencyId && s.externalTimesheetId === externalId) {
        return Promise.resolve(t);
      }
    }
    return Promise.resolve(undefined);
  }

  findByWorkerInRange(
    agencyId: AgencyId,
    workerId: StaffId,
    fromDate: Date,
    toDate: Date,
  ): Promise<readonly Timesheet[]> {
    const out: Timesheet[] = [];
    for (const t of this.byId.values()) {
      const s = t.toSnapshot();
      if (s.agencyId !== agencyId || s.workerId !== workerId) continue;
      const inRange = s.entries.some(
        (e) =>
          e.workDate.getTime() >= fromDate.getTime() && e.workDate.getTime() <= toDate.getTime(),
      );
      if (inRange) out.push(t);
    }
    return Promise.resolve(out);
  }

  size(): number {
    return this.byId.size;
  }
}
