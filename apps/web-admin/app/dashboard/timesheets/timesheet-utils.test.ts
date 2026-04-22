import { describe, expect, it } from 'vitest';
import {
  computeSignableSelected,
  filterTimesheets,
  formatHours,
  groupByWeek,
  hasBlocker,
} from './timesheet-utils.js';
import type { TimesheetDto } from './TimesheetsReview.js';

function make(overrides: Partial<TimesheetDto> = {}): TimesheetDto {
  return {
    id: 'ts-1',
    externalTimesheetId: 'mp-ts-1',
    workerName: 'Jean Dupont',
    clientName: 'Acme SA',
    weekIso: '2026-W17',
    state: 'received',
    totalMinutes: 480,
    hourlyRateRappen: 3200,
    totalCostRappen: 25600,
    entries: [],
    anomalies: [],
    receivedAt: '2026-04-22T08:00:00Z',
    ...overrides,
  };
}

describe('formatHours', () => {
  it('formate 480 min = 8h00', () => {
    expect(formatHours(480)).toBe('8h00');
  });

  it('formate 125 min = 2h05', () => {
    expect(formatHours(125)).toBe('2h05');
  });

  it('formate 0 = 0h00', () => {
    expect(formatHours(0)).toBe('0h00');
  });
});

describe('hasBlocker', () => {
  it('true si ≥1 anomalie blocker', () => {
    expect(
      hasBlocker({
        anomalies: [
          { kind: 'weekly_limit_exceeded', severity: 'blocker', message: 'x' },
          { kind: 'missing_break', severity: 'warning', message: 'y' },
        ],
      }),
    ).toBe(true);
  });

  it('false si que des warnings', () => {
    expect(
      hasBlocker({
        anomalies: [{ kind: 'missing_break', severity: 'warning', message: 'x' }],
      }),
    ).toBe(false);
  });

  it('false si aucune anomalie', () => {
    expect(hasBlocker({ anomalies: [] })).toBe(false);
  });
});

describe('groupByWeek', () => {
  it('groupe par weekIso et trie desc (semaine récente en haut)', () => {
    const ts = [
      make({ id: 'a', weekIso: '2026-W15' }),
      make({ id: 'b', weekIso: '2026-W17' }),
      make({ id: 'c', weekIso: '2026-W15' }),
      make({ id: 'd', weekIso: '2026-W16' }),
    ];
    const grouped = groupByWeek(ts);
    expect(grouped.map(([w]) => w)).toEqual(['2026-W17', '2026-W16', '2026-W15']);
    expect(grouped[2]?.[1].map((t) => t.id)).toEqual(['a', 'c']);
  });

  it('tableau vide → groupes vides', () => {
    expect(groupByWeek([])).toEqual([]);
  });
});

describe('filterTimesheets', () => {
  const items = [
    make({ id: '1', state: 'received' }),
    make({ id: '2', state: 'under_review' }),
    make({ id: '3', state: 'signed', receivedAt: '2026-04-22T10:00:00Z' }),
    make({ id: '4', state: 'signed', receivedAt: '2026-04-21T10:00:00Z' }),
    make({ id: '5', state: 'disputed' }),
  ];

  it('filter=all → tout', () => {
    expect(filterTimesheets(items, 'all', '2026-04-22')).toHaveLength(5);
  });

  it('filter=to_review → received + under_review', () => {
    const out = filterTimesheets(items, 'to_review', '2026-04-22');
    expect(out.map((t) => t.id)).toEqual(['1', '2']);
  });

  it('filter=signed_today → signed avec receivedAt = today only', () => {
    const out = filterTimesheets(items, 'signed_today', '2026-04-22');
    expect(out.map((t) => t.id)).toEqual(['3']);
  });
});

describe('computeSignableSelected', () => {
  const items = [
    make({ id: 'ok1', state: 'received' }),
    make({ id: 'ok2', state: 'under_review' }),
    make({
      id: 'blk',
      state: 'received',
      anomalies: [{ kind: 'weekly_limit_exceeded', severity: 'blocker', message: 'x' }],
    }),
    make({ id: 'signed', state: 'signed' }),
    make({ id: 'unknown', state: 'received' }),
  ];

  it('garde received/under_review sans blocker', () => {
    const signable = computeSignableSelected(new Set(['ok1', 'ok2']), items);
    expect(signable).toEqual(['ok1', 'ok2']);
  });

  it('exclut les blockers', () => {
    const signable = computeSignableSelected(new Set(['ok1', 'blk']), items);
    expect(signable).toEqual(['ok1']);
  });

  it('exclut les signed', () => {
    const signable = computeSignableSelected(new Set(['signed', 'ok2']), items);
    expect(signable).toEqual(['ok2']);
  });

  it('exclut les ids inconnus (plus dans la liste)', () => {
    const signable = computeSignableSelected(new Set(['ok1', 'nope']), items);
    expect(signable).toEqual(['ok1']);
  });
});
