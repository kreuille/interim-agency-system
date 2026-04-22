import type {
  AgencyId,
  StaffId,
  Timesheet,
  TimesheetId,
  TimesheetRepository,
} from '@interim/domain';
import type { Result } from '@interim/shared';
import { TimesheetMpError, type TimesheetMpPort } from './timesheet-mp-port.js';

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

/**
 * Stub `TimesheetMpPort` pour tests : enregistre les calls et permet
 * d'orchestrer succès/erreur via `failNextSign` / `failNextDispute`.
 * Idempotent côté stub : 2e call avec même idempotencyKey renvoie le
 * même résultat sans incrémenter le compteur.
 */
export class StubTimesheetMpPort implements TimesheetMpPort {
  readonly signCalls: {
    readonly externalTimesheetId: string;
    readonly idempotencyKey: string;
    readonly approvedBy: string;
    readonly approvedAt: Date;
    readonly notes?: string;
  }[] = [];
  readonly disputeCalls: {
    readonly externalTimesheetId: string;
    readonly idempotencyKey: string;
    readonly disputedBy: string;
    readonly disputedAt: Date;
    readonly reason: string;
  }[] = [];
  failNextSign?: 'transient' | 'permanent' | undefined;
  failNextDispute?: 'transient' | 'permanent' | undefined;

  notifySigned(input: {
    externalTimesheetId: string;
    idempotencyKey: string;
    approvedBy: string;
    approvedAt: Date;
    notes?: string;
  }): Promise<Result<{ signed: true; signedAt: Date }, TimesheetMpError>> {
    if (this.failNextSign) {
      const kind = this.failNextSign;
      this.failNextSign = undefined;
      return Promise.resolve({
        ok: false,
        error: new TimesheetMpError(kind, `simulated ${kind} on sign`),
      });
    }
    this.signCalls.push({ ...input });
    return Promise.resolve({
      ok: true,
      value: { signed: true, signedAt: input.approvedAt },
    });
  }

  notifyDisputed(input: {
    externalTimesheetId: string;
    idempotencyKey: string;
    disputedBy: string;
    disputedAt: Date;
    reason: string;
  }): Promise<Result<{ disputed: true }, TimesheetMpError>> {
    if (this.failNextDispute) {
      const kind = this.failNextDispute;
      this.failNextDispute = undefined;
      return Promise.resolve({
        ok: false,
        error: new TimesheetMpError(kind, `simulated ${kind} on dispute`),
      });
    }
    this.disputeCalls.push({ ...input });
    return Promise.resolve({ ok: true, value: { disputed: true } });
  }
}
