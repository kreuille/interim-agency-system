import type { AgencyId, StaffId } from '../shared/ids.js';
import type { Timesheet, TimesheetId } from './timesheet.js';

/**
 * Port repository pour `Timesheet`. Multi-tenant strict (CLAUDE.md §3.5).
 */
export interface TimesheetRepository {
  save(timesheet: Timesheet): Promise<void>;

  findById(agencyId: AgencyId, id: TimesheetId): Promise<Timesheet | undefined>;

  /** Lookup par ID externe MP (idempotency sur webhook). */
  findByExternalId(agencyId: AgencyId, externalId: string): Promise<Timesheet | undefined>;

  /**
   * Pour calcul cumul hebdo : tous les timesheets d'un worker dans un
   * range de dates. Permet d'évaluer le dépassement 50h sur la semaine
   * en sommant plusieurs missions parallèles.
   */
  findByWorkerInRange(
    agencyId: AgencyId,
    workerId: StaffId,
    fromDate: Date,
    toDate: Date,
  ): Promise<readonly Timesheet[]>;
}
