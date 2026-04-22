import type { Clock } from '@interim/shared';
import type { AgencyId, StaffId } from '../shared/ids.js';
import type { ClientId } from '../clients/client.js';
import { DomainError } from '../workers/errors.js';
import type { MissionContractId } from '../contracts/mission-contract.js';
import type { TimesheetAnomaly } from './anomaly.js';

export type TimesheetId = string & { readonly __brand: 'TimesheetId' };

export function asTimesheetId(value: string): TimesheetId {
  if (value.length === 0) throw new Error('TimesheetId cannot be empty');
  return value as TimesheetId;
}

/**
 * États d'un timesheet côté agence (miroir + enrichi du modèle MP).
 *
 * - `received`         : reçu via webhook MP, anomalies calculées.
 * - `under_review`     : ≥1 anomalie blocker → dispatcher doit revoir.
 * - `signed`           : agence a signé → push MP via API (A4.7).
 * - `disputed`         : agence conteste → push MP avec raison (A4.7).
 * - `tacit`            : MP a tacitement validé (handler timesheet.tacitly_validated).
 *
 * Transitions :
 *   received → under_review | signed | disputed | tacit
 *   under_review → signed | disputed | tacit
 *   (signed, disputed, tacit = terminaux)
 */
export const TIMESHEET_STATES = [
  'received',
  'under_review',
  'signed',
  'disputed',
  'tacit',
] as const;
export type TimesheetState = (typeof TIMESHEET_STATES)[number];

const TERMINAL: ReadonlySet<TimesheetState> = new Set(['signed', 'disputed', 'tacit']);

const TRANSITIONS: ReadonlyMap<TimesheetState, ReadonlySet<TimesheetState>> = new Map([
  ['received', new Set<TimesheetState>(['under_review', 'signed', 'disputed', 'tacit'])],
  ['under_review', new Set<TimesheetState>(['signed', 'disputed', 'tacit'])],
  ['signed', new Set<TimesheetState>()],
  ['disputed', new Set<TimesheetState>()],
  ['tacit', new Set<TimesheetState>()],
]);

export class InvalidTimesheetTransition extends DomainError {
  constructor(from: TimesheetState, to: TimesheetState) {
    super('invalid_timesheet_transition', `Transition interdite : ${from} → ${to}`);
  }
}

export class TimesheetAlreadyTerminal extends DomainError {
  constructor(state: TimesheetState) {
    super('timesheet_already_terminal', `Timesheet déjà terminal : ${state}`);
  }
}

/**
 * Une journée travaillée. Plusieurs `TimesheetEntry` composent un
 * `Timesheet` (typiquement 1 par mission ou 1 par semaine).
 */
export interface TimesheetEntry {
  readonly workDate: Date; // jour civil (heure 00:00 UTC)
  readonly plannedStart: Date;
  readonly plannedEnd: Date;
  readonly actualStart: Date;
  readonly actualEnd: Date;
  readonly breakMinutes: number;
}

export interface TimesheetProps {
  readonly id: TimesheetId;
  readonly agencyId: AgencyId;
  readonly externalTimesheetId: string;
  readonly workerId: StaffId;
  readonly clientId: ClientId;
  readonly missionContractId: MissionContractId | undefined;
  readonly entries: readonly TimesheetEntry[];
  readonly totalMinutes: number;
  readonly hourlyRateRappen: number;
  readonly totalCostRappen: number;
  readonly anomalies: readonly TimesheetAnomaly[];
  readonly state: TimesheetState;
  readonly receivedAt: Date;
  readonly stateChangedAt: Date;
  readonly reviewedAt: Date | undefined;
  readonly reviewerUserId: string | undefined;
}

export interface CreateTimesheetInput {
  readonly id: TimesheetId;
  readonly agencyId: AgencyId;
  readonly externalTimesheetId: string;
  readonly workerId: StaffId;
  readonly clientId: ClientId;
  readonly missionContractId?: MissionContractId;
  readonly entries: readonly TimesheetEntry[];
  readonly hourlyRateRappen: number;
  readonly anomalies: readonly TimesheetAnomaly[];
  readonly receivedAt: Date;
}

/**
 * Aggregate Timesheet — version A4.5 (réception inbound).
 * A4.7 ajoutera `sign()` / `dispute()` qui pousseront vers MP via API.
 */
export class Timesheet {
  private constructor(private state: TimesheetProps) {}

  static create(input: CreateTimesheetInput): Timesheet {
    if (input.entries.length === 0) {
      throw new DomainError('invalid_timesheet', 'entries doit contenir ≥1 journée');
    }
    if (input.hourlyRateRappen <= 0) {
      throw new DomainError('invalid_rate', 'hourlyRateRappen doit être > 0');
    }
    for (const e of input.entries) {
      if (e.actualEnd.getTime() <= e.actualStart.getTime()) {
        throw new DomainError('invalid_entry', 'actualEnd doit être > actualStart');
      }
      if (e.breakMinutes < 0) {
        throw new DomainError('invalid_entry', 'breakMinutes ne peut pas être négatif');
      }
    }
    const totalMinutes = computeTotalMinutes(input.entries);
    const totalCostRappen = Math.round((totalMinutes / 60) * input.hourlyRateRappen);
    // Etat initial : si ≥1 blocker → under_review, sinon received.
    const hasBlocker = input.anomalies.some((a) => a.severity === 'blocker');
    const initialState: TimesheetState = hasBlocker ? 'under_review' : 'received';
    return new Timesheet({
      id: input.id,
      agencyId: input.agencyId,
      externalTimesheetId: input.externalTimesheetId,
      workerId: input.workerId,
      clientId: input.clientId,
      missionContractId: input.missionContractId,
      entries: input.entries,
      totalMinutes,
      hourlyRateRappen: input.hourlyRateRappen,
      totalCostRappen,
      anomalies: input.anomalies,
      state: initialState,
      receivedAt: input.receivedAt,
      stateChangedAt: input.receivedAt,
      reviewedAt: undefined,
      reviewerUserId: undefined,
    });
  }

  static fromPersistence(props: TimesheetProps): Timesheet {
    return new Timesheet(props);
  }

  get id(): TimesheetId {
    return this.state.id;
  }
  get agencyId(): AgencyId {
    return this.state.agencyId;
  }
  get currentState(): TimesheetState {
    return this.state.state;
  }
  get totalMinutes(): number {
    return this.state.totalMinutes;
  }
  get totalCostRappen(): number {
    return this.state.totalCostRappen;
  }
  get anomalies(): readonly TimesheetAnomaly[] {
    return this.state.anomalies;
  }

  toSnapshot(): TimesheetProps {
    return this.state;
  }

  /**
   * Marque comme review en cours par un dispatcher (A4.6 UI).
   * No-op si déjà under_review ou terminal.
   */
  beginReview(reviewerUserId: string, clock: Clock): void {
    if (TERMINAL.has(this.state.state)) {
      throw new TimesheetAlreadyTerminal(this.state.state);
    }
    if (this.state.state === 'under_review') return;
    this.transition('under_review', clock);
    this.state = {
      ...this.state,
      reviewedAt: clock.now(),
      reviewerUserId,
    };
  }

  /**
   * Validation tacite reçue de MP (timesheet.tacitly_validated). Termine
   * le workflow sans intervention agence.
   */
  markTacit(clock: Clock): void {
    this.transition('tacit', clock);
  }

  /**
   * Signature par dispatcher (A4.7 push MP). Refuse si anomalie blocker.
   */
  sign(reviewerUserId: string, clock: Clock): void {
    const blockers = this.state.anomalies.filter((a) => a.severity === 'blocker');
    if (blockers.length > 0) {
      throw new DomainError(
        'cannot_sign_with_blockers',
        `Impossible de signer : ${String(blockers.length)} anomalie(s) bloquante(s)`,
      );
    }
    this.transition('signed', clock);
    this.state = { ...this.state, reviewedAt: clock.now(), reviewerUserId };
  }

  /**
   * Dispute par dispatcher (A4.7 push MP). Toujours autorisé tant que non terminal.
   */
  dispute(reviewerUserId: string, clock: Clock): void {
    this.transition('disputed', clock);
    this.state = { ...this.state, reviewedAt: clock.now(), reviewerUserId };
  }

  private transition(to: TimesheetState, clock: Clock): void {
    const allowed = TRANSITIONS.get(this.state.state);
    if (!allowed?.has(to)) {
      throw new InvalidTimesheetTransition(this.state.state, to);
    }
    this.state = { ...this.state, state: to, stateChangedAt: clock.now() };
  }
}

function computeTotalMinutes(entries: readonly TimesheetEntry[]): number {
  let total = 0;
  for (const e of entries) {
    const worked = (e.actualEnd.getTime() - e.actualStart.getTime()) / 60_000;
    total += Math.max(0, worked - e.breakMinutes);
  }
  return Math.round(total);
}
