import { DomainError } from '../workers/errors.js';

export class WeeklyLimitExceededInPayroll extends DomainError {
  constructor(workerId: string, totalMinutes: number, limit: number) {
    super(
      'weekly_limit_exceeded',
      `Cumul ${(totalMinutes / 60).toFixed(1)}h > limite LTr ${(limit / 60).toFixed(0)}h pour worker ${workerId}`,
    );
  }
}

export class NoSignedTimesheets extends DomainError {
  constructor(workerId: string, isoWeek: string) {
    super(
      'no_signed_timesheets',
      `Aucun timesheet signé/tacit pour worker ${workerId} semaine ${isoWeek}`,
    );
  }
}

export class MismatchedWeek extends DomainError {
  constructor(timesheetId: string, expectedWeek: string, actualWeek: string) {
    super(
      'mismatched_week',
      `Timesheet ${timesheetId} en semaine ${actualWeek} ne match pas ${expectedWeek}`,
    );
  }
}

export class InvalidPayrollInput extends DomainError {
  constructor(reason: string) {
    super('invalid_payroll_input', `Input paie invalide : ${reason}`);
  }
}
