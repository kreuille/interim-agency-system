import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId } from '../shared/ids.js';
import { asClientId } from '../clients/client.js';
import { asMissionContractId } from '../contracts/mission-contract.js';
import {
  asTimesheetId,
  InvalidTimesheetTransition,
  Timesheet,
  TimesheetAlreadyTerminal,
  type TimesheetEntry,
} from './timesheet.js';
import type { TimesheetAnomaly } from './anomaly.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = asAgencyId('agency-a');
const WORKER = asStaffId('worker-1');
const CLIENT = asClientId('client-1');

function basicEntry(): TimesheetEntry {
  return {
    workDate: new Date('2026-04-22T00:00:00Z'),
    plannedStart: new Date('2026-04-22T08:00:00Z'),
    plannedEnd: new Date('2026-04-22T17:00:00Z'),
    actualStart: new Date('2026-04-22T08:00:00Z'),
    actualEnd: new Date('2026-04-22T17:00:00Z'),
    breakMinutes: 60,
  };
}

function blocker(): TimesheetAnomaly {
  return {
    kind: 'weekly_limit_exceeded',
    severity: 'blocker',
    message: 'test blocker',
    context: {},
  };
}

function warning(): TimesheetAnomaly {
  return {
    kind: 'planned_actual_divergence',
    severity: 'warning',
    message: 'test warning',
    context: {},
  };
}

describe('Timesheet.create', () => {
  it("happy path : received par défaut, pas d'anomalie", () => {
    const t = Timesheet.create({
      id: asTimesheetId('ts-1'),
      agencyId: AGENCY,
      externalTimesheetId: 'mp-ts-1',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [basicEntry()],
      hourlyRateRappen: 3200,
      anomalies: [],
      receivedAt: NOW,
    });
    expect(t.currentState).toBe('received');
    // 9h - 1h pause = 8h = 480 min ; coût = 8 * 3200 = 25600 rappen = CHF 256
    expect(t.totalMinutes).toBe(480);
    expect(t.totalCostRappen).toBe(25600);
  });

  it('anomalie blocker → état initial under_review', () => {
    const t = Timesheet.create({
      id: asTimesheetId('ts-2'),
      agencyId: AGENCY,
      externalTimesheetId: 'mp-ts-2',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [basicEntry()],
      hourlyRateRappen: 3200,
      anomalies: [blocker()],
      receivedAt: NOW,
    });
    expect(t.currentState).toBe('under_review');
  });

  it('anomalie warning seule → état initial received', () => {
    const t = Timesheet.create({
      id: asTimesheetId('ts-3'),
      agencyId: AGENCY,
      externalTimesheetId: 'mp-ts-3',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [basicEntry()],
      hourlyRateRappen: 3200,
      anomalies: [warning()],
      receivedAt: NOW,
    });
    expect(t.currentState).toBe('received');
  });

  it('rejette entries vides', () => {
    expect(() =>
      Timesheet.create({
        id: asTimesheetId('ts-x'),
        agencyId: AGENCY,
        externalTimesheetId: 'mp-x',
        workerId: WORKER,
        clientId: CLIENT,
        entries: [],
        hourlyRateRappen: 3200,
        anomalies: [],
        receivedAt: NOW,
      }),
    ).toThrow();
  });

  it('rejette taux <= 0', () => {
    expect(() =>
      Timesheet.create({
        id: asTimesheetId('ts-y'),
        agencyId: AGENCY,
        externalTimesheetId: 'mp-y',
        workerId: WORKER,
        clientId: CLIENT,
        entries: [basicEntry()],
        hourlyRateRappen: 0,
        anomalies: [],
        receivedAt: NOW,
      }),
    ).toThrow();
  });

  it('rejette actualEnd <= actualStart', () => {
    const bad: TimesheetEntry = {
      ...basicEntry(),
      actualStart: new Date('2026-04-22T17:00:00Z'),
      actualEnd: new Date('2026-04-22T08:00:00Z'),
    };
    expect(() =>
      Timesheet.create({
        id: asTimesheetId('ts-z'),
        agencyId: AGENCY,
        externalTimesheetId: 'mp-z',
        workerId: WORKER,
        clientId: CLIENT,
        entries: [bad],
        hourlyRateRappen: 3200,
        anomalies: [],
        receivedAt: NOW,
      }),
    ).toThrow();
  });
});

describe('Timesheet — transitions', () => {
  function fresh(): Timesheet {
    return Timesheet.create({
      id: asTimesheetId('ts-tr'),
      agencyId: AGENCY,
      externalTimesheetId: 'mp-tr',
      workerId: WORKER,
      clientId: CLIENT,
      missionContractId: asMissionContractId('mc-1'),
      entries: [basicEntry()],
      hourlyRateRappen: 3200,
      anomalies: [],
      receivedAt: NOW,
    });
  }

  it('beginReview → under_review + reviewer noté', () => {
    const t = fresh();
    t.beginReview('u-1', clock);
    expect(t.currentState).toBe('under_review');
    expect(t.toSnapshot().reviewerUserId).toBe('u-1');
  });

  it('sign sans anomalie blocker → signed', () => {
    const t = fresh();
    t.sign('u-1', clock);
    expect(t.currentState).toBe('signed');
  });

  it('sign avec anomalie blocker → rejeté', () => {
    const t = Timesheet.create({
      id: asTimesheetId('ts-blk'),
      agencyId: AGENCY,
      externalTimesheetId: 'mp-blk',
      workerId: WORKER,
      clientId: CLIENT,
      entries: [basicEntry()],
      hourlyRateRappen: 3200,
      anomalies: [blocker()],
      receivedAt: NOW,
    });
    expect(() => {
      t.sign('u-1', clock);
    }).toThrow(/bloquante/);
  });

  it('dispute → disputed', () => {
    const t = fresh();
    t.dispute('u-1', clock);
    expect(t.currentState).toBe('disputed');
  });

  it('markTacit → tacit', () => {
    const t = fresh();
    t.markTacit(clock);
    expect(t.currentState).toBe('tacit');
  });

  it('terminal signed → beginReview throws', () => {
    const t = fresh();
    t.sign('u-1', clock);
    expect(() => {
      t.beginReview('u-2', clock);
    }).toThrow(TimesheetAlreadyTerminal);
  });

  it('signed → dispute interdit (transition invalid)', () => {
    const t = fresh();
    t.sign('u-1', clock);
    expect(() => {
      t.dispute('u-2', clock);
    }).toThrow(InvalidTimesheetTransition);
  });
});
