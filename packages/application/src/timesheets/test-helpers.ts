import type {
  AgencyId,
  ListTimesheetsInput,
  StaffId,
  Timesheet,
  TimesheetId,
  TimesheetPage,
  TimesheetRepository,
} from '@interim/domain';
import type { Result } from '@interim/shared';
import { TimesheetMpError, type TimesheetMpPort } from './timesheet-mp-port.js';
import type {
  DashboardNotifier,
  EmailNotifier,
  TimesheetAnomalyNotification,
} from './notifier-ports.js';
import type { CctMinimumLookupInput, CctMinimumLookupPort } from './cct-minimum-lookup.port.js';

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

  list(input: ListTimesheetsInput): Promise<TimesheetPage> {
    const all = [...this.byId.values()]
      .filter((t) => {
        const s = t.toSnapshot();
        if (s.agencyId !== input.agencyId) return false;
        if (input.state !== undefined && s.state !== input.state) return false;
        return true;
      })
      .sort((a, b) => {
        const ra = a.toSnapshot().receivedAt.getTime();
        const rb = b.toSnapshot().receivedAt.getTime();
        if (ra !== rb) return rb - ra; // desc
        return a.id.localeCompare(b.id);
      });
    const limit = input.limit ?? 50;
    let start = 0;
    if (input.cursor) {
      const idx = all.findIndex((t) => this.cursorOf(t) === input.cursor);
      start = idx >= 0 ? idx + 1 : 0;
    }
    const items = all.slice(start, start + limit);
    const last = items.length > 0 ? items[items.length - 1] : undefined;
    const nextCursor = start + limit < all.length && last ? this.cursorOf(last) : null;
    return Promise.resolve({ items, nextCursor });
  }

  private cursorOf(t: Timesheet): string {
    return `${t.toSnapshot().receivedAt.toISOString()}|${t.id}`;
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

/**
 * `EmailNotifier` in-memory : enregistre les notifications + déduplique
 * sur `(agencyId, timesheetId)` (idempotency contractuelle).
 */
export class InMemoryEmailNotifier implements EmailNotifier {
  readonly notifications: TimesheetAnomalyNotification[] = [];
  private readonly seen = new Set<string>();

  notifyTimesheetAnomalies(input: TimesheetAnomalyNotification): Promise<void> {
    const key = `${input.agencyId}:${input.timesheetId}`;
    if (this.seen.has(key)) return Promise.resolve();
    this.seen.add(key);
    this.notifications.push(input);
    return Promise.resolve();
  }
}

/**
 * `DashboardNotifier` in-memory : push toutes les alertes (pas de
 * dedup côté push live, contrairement à l'email — c'est l'UI qui dédoublonne).
 */
export class InMemoryDashboardNotifier implements DashboardNotifier {
  readonly alerts: TimesheetAnomalyNotification[] = [];

  pushTimesheetAlert(input: TimesheetAnomalyNotification): Promise<void> {
    this.alerts.push(input);
    return Promise.resolve();
  }
}

/**
 * `CctMinimumLookupPort` in-memory : config par
 * `(canton, branch?, periodFromIso)`. Renvoie le rate de la période
 * applicable la plus récente <= atDate.
 */
export class InMemoryCctMinimumLookup implements CctMinimumLookupPort {
  private readonly entries: {
    canton: string;
    branch?: string;
    periodFrom: Date;
    rateRappen: number;
  }[] = [];

  register(entry: { canton: string; branch?: string; periodFrom: Date; rateRappen: number }): this {
    this.entries.push(entry);
    return this;
  }

  resolve(input: CctMinimumLookupInput): Promise<number | undefined> {
    const at = (input.atDate ?? new Date()).getTime();
    const candidates = this.entries
      .filter((e) => e.canton === input.canton && e.periodFrom.getTime() <= at)
      .filter((e) => (input.branch ? e.branch === input.branch || !e.branch : true))
      .sort((a, b) => b.periodFrom.getTime() - a.periodFrom.getTime());
    return Promise.resolve(candidates[0]?.rateRappen);
  }
}
