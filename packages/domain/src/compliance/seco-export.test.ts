import { describe, expect, it } from 'vitest';
import {
  buildSecoCsvBundle,
  computeSecoStats,
  type SecoExportBundle,
  type SecoMissionRow,
  type SecoTimesheetRow,
  type SecoWorkerRow,
} from './seco-export.js';

function bundle(overrides: Partial<SecoExportBundle> = {}): SecoExportBundle {
  return {
    agencyId: 'agency-a',
    agencyName: 'Acme Intérim',
    range: { fromIso: '2026-01-01', toIso: '2026-06-30' },
    generatedAtIso: '2026-07-01T08:00:00.000Z',
    lse: {
      authorization: 'cantonal',
      authorizationNumber: 'GE-LSE-2024-001',
      issuedByCanton: 'GE',
      validFromIso: '2024-01-01',
      validUntilIso: '2027-01-01',
    },
    workers: [],
    missions: [],
    contracts: [],
    timesheets: [],
    stats: {
      workersCount: 0,
      activeMissionsCount: 0,
      signedContractsCount: 0,
      timesheetsCount: 0,
      timesheetsTotalHours: 0,
      anomaliesTotal: 0,
    },
    ...overrides,
  };
}

describe('computeSecoStats', () => {
  it('agrégats vides → tous zéros', () => {
    const s = computeSecoStats({ workers: [], missions: [], contracts: [], timesheets: [] });
    expect(s.workersCount).toBe(0);
    expect(s.timesheetsTotalHours).toBe(0);
  });

  it('compte workers + timesheets + heures totales + anomalies', () => {
    const workers: SecoWorkerRow[] = [
      {
        workerId: 'w-1',
        lastName: 'D',
        firstName: 'J',
        avs: '756.x',
        permit: 'C',
        canton: 'GE',
        registeredAtIso: '2024-01-01',
        activeMissionsCount: 1,
      },
      {
        workerId: 'w-2',
        lastName: 'D',
        firstName: 'M',
        avs: '756.y',
        permit: 'B',
        canton: 'VD',
        registeredAtIso: '2024-02-01',
        activeMissionsCount: 0,
      },
    ];
    const timesheets: SecoTimesheetRow[] = [
      {
        timesheetId: 'ts-1',
        externalTimesheetId: 'mp-1',
        workerId: 'w-1',
        clientName: 'Acme',
        weekIso: '2026-W17',
        totalMinutes: 480,
        state: 'signed',
        anomaliesCount: 0,
        receivedAtIso: '2026-04-27',
      },
      {
        timesheetId: 'ts-2',
        externalTimesheetId: 'mp-2',
        workerId: 'w-1',
        clientName: 'Acme',
        weekIso: '2026-W18',
        totalMinutes: 600,
        state: 'signed',
        anomaliesCount: 2,
        receivedAtIso: '2026-05-04',
      },
    ];
    const s = computeSecoStats({ workers, missions: [], contracts: [], timesheets });
    expect(s.workersCount).toBe(2);
    expect(s.timesheetsCount).toBe(2);
    expect(s.timesheetsTotalHours).toBeCloseTo(18.0, 1); // 480+600 / 60 = 18h
    expect(s.anomaliesTotal).toBe(2);
  });

  it('compte missions actives (sent_for_signature ou signed)', () => {
    const missions: SecoMissionRow[] = [
      {
        missionContractId: 'mc-1',
        reference: 'MC-1',
        workerId: 'w-1',
        clientName: 'Acme',
        canton: 'GE',
        cctReference: 'CN',
        hourlyRateRappen: 3200,
        startsAtIso: '2026-04-01',
        endsAtIso: '2026-04-30',
        state: 'signed',
      },
      {
        missionContractId: 'mc-2',
        reference: 'MC-2',
        workerId: 'w-1',
        clientName: 'Acme',
        canton: 'GE',
        cctReference: 'CN',
        hourlyRateRappen: 3200,
        startsAtIso: '2026-04-01',
        endsAtIso: '2026-04-30',
        state: 'cancelled',
      },
    ];
    const s = computeSecoStats({ workers: [], missions, contracts: [], timesheets: [] });
    expect(s.activeMissionsCount).toBe(1);
  });
});

describe('buildSecoCsvBundle', () => {
  it('5 fichiers générés (résumé + 4 csv)', () => {
    const csv = buildSecoCsvBundle(bundle());
    expect(csv.summaryTxt.filename).toBe('SECO-resume.txt');
    expect(csv.workers.filename).toBe('workers.csv');
    expect(csv.missions.filename).toBe('missions.csv');
    expect(csv.contracts.filename).toBe('contracts.csv');
    expect(csv.timesheets.filename).toBe('timesheets.csv');
  });

  it('CSV démarrent avec BOM UTF-8', () => {
    const csv = buildSecoCsvBundle(bundle());
    expect(csv.workers.content.charCodeAt(0)).toBe(0xfeff);
    expect(csv.missions.content.charCodeAt(0)).toBe(0xfeff);
  });

  it('séparateur CSV est ; (point-virgule, Excel CH)', () => {
    const b = bundle({
      workers: [
        {
          workerId: 'w-1',
          lastName: 'Dupont',
          firstName: 'Jean',
          avs: '756.1234.5678.97',
          permit: 'C',
          canton: 'GE',
          registeredAtIso: '2024-01-01',
          activeMissionsCount: 2,
        },
      ],
    });
    const csv = buildSecoCsvBundle(b);
    expect(csv.workers.content).toContain('Dupont;Jean;756.1234.5678.97;C;GE');
  });

  it('résumé txt inclut agence + période + LSE + stats', () => {
    const b = bundle({
      stats: {
        workersCount: 5,
        activeMissionsCount: 12,
        signedContractsCount: 8,
        timesheetsCount: 30,
        timesheetsTotalHours: 240.5,
        anomaliesTotal: 3,
      },
    });
    const txt = buildSecoCsvBundle(b).summaryTxt.content;
    expect(txt).toContain('Acme Intérim');
    expect(txt).toContain('2026-01-01 → 2026-06-30');
    expect(txt).toContain('GE-LSE-2024-001');
    expect(txt).toContain('Workers placés : 5');
    expect(txt).toContain('Total heures : 240.50 h');
    expect(txt).toContain('Anomalies détectées : 3');
  });

  it('missions exporte hourlyRateRappen comme CHF 2 décimales', () => {
    const b = bundle({
      missions: [
        {
          missionContractId: 'mc-1',
          reference: 'MC-1',
          workerId: 'w-1',
          clientName: 'Acme',
          canton: 'GE',
          cctReference: 'CN',
          hourlyRateRappen: 3275, // 32.75 CHF
          startsAtIso: '2026-04-01',
          endsAtIso: '2026-04-30',
          state: 'signed',
        },
      ],
    });
    const csv = buildSecoCsvBundle(b);
    expect(csv.missions.content).toContain(';32.75;');
  });

  it('échappe ; dans valeurs avec wrap quotes + double quotes', () => {
    const b = bundle({
      workers: [
        {
          workerId: 'w-1',
          lastName: 'Müller; PhD',
          firstName: 'M.',
          avs: '756.x',
          permit: 'C',
          canton: 'GE',
          registeredAtIso: '2024-01-01',
          activeMissionsCount: 0,
        },
      ],
    });
    const csv = buildSecoCsvBundle(b);
    expect(csv.workers.content).toContain('"Müller; PhD"');
  });

  it('déterministe : 2 builds identiques → mêmes bytes', () => {
    const b = bundle();
    const a = buildSecoCsvBundle(b);
    const b2 = buildSecoCsvBundle(b);
    expect(a.summaryTxt.content).toBe(b2.summaryTxt.content);
    expect(a.workers.content).toBe(b2.workers.content);
  });
});
