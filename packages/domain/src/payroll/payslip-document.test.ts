import { describe, expect, it } from 'vitest';
import { asStaffId } from '../shared/ids.js';
import {
  buildPayslipDocument,
  maskAvs,
  maskIban,
  type PayslipAgencyInfo,
  type PayslipWorkerLegal,
} from './payslip-document.js';
import type { PayslipBreakdown } from './payslip-engine.js';

const WORKER = asStaffId('worker-1');

const AGENCY: PayslipAgencyInfo = {
  name: 'Acme Intérim',
  ide: 'CHE-100.000.001',
  lseAuthorization: 'GE-LSE-2024-001',
  addressLine1: 'Rue du Stand 12',
  postalCode: '1204',
  city: 'Genève',
  canton: 'GE',
};

const WORKER_LEGAL: PayslipWorkerLegal = {
  firstName: 'Jean',
  lastName: 'Dupont',
  avs: '756.1234.5678.97',
  iban: 'CH56 0900 0000 1234 5678 9',
  permit: 'C',
};

function breakdown(overrides: Partial<PayslipBreakdown> = {}): PayslipBreakdown {
  return {
    workerId: WORKER,
    isoWeek: '2026-W17',
    workedGrossRappen: 200_000n,
    bonus13thRappen: 16_660n,
    holidayPayRappen: 16_660n,
    totalGrossRappen: 233_320n,
    avsRappen: 12_366n,
    acRappen: 2_566n,
    laaRappen: 3_266n,
    lpp: { coordinatedAnnualRappen: 6_615_000n, totalBp: 700, employeeWeekRappen: 4_452n },
    isRappen: 0n,
    isCanton: null,
    totalDeductionsRappen: 22_650n,
    netBeforeRoundingRappen: 210_670n,
    round5AdjustmentRappen: 0n,
    netRappen: 210_670n,
    engineVersion: '1.0.0',
    ratesApplied: {
      avsBp: 530,
      acLevel1Bp: 110,
      acLevel2Bp: 50,
      acThresholdAnnualRappen: 14_820_000n,
      laaNbuBp: 140,
      lppFranchiseAnnualRappen: 2_205_000n,
      lppCeilingAnnualRappen: 8_820_000n,
    },
    yearApplied: 2026,
    ...overrides,
  };
}

describe('maskAvs', () => {
  it('garde 5 premiers + 2 derniers', () => {
    expect(maskAvs('756.1234.5678.97')).toBe('756.1***.****.97');
  });

  it('avs court → ***', () => {
    expect(maskAvs('756.1')).toBe('***');
  });
});

describe('maskIban', () => {
  it('garde 4 premiers + 2 derniers', () => {
    expect(maskIban('CH56 0900 0000 1234 5678 9')).toBe('CH56 **** **** **** **89');
  });

  it('compact → masqué pareil', () => {
    expect(maskIban('CH5609000000123456789')).toBe('CH56 **** **** **** **89');
  });
});

describe('buildPayslipDocument', () => {
  it('header agence inclut nom + IDE + LSE + adresse', () => {
    const doc = buildPayslipDocument({
      breakdown: breakdown(),
      agency: AGENCY,
      worker: WORKER_LEGAL,
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    });
    expect(doc.agencyHeader[0]).toBe('Acme Intérim');
    expect(doc.agencyHeader[1]).toContain('CHE-100.000.001');
    expect(doc.agencyHeader[1]).toContain('GE-LSE-2024-001');
  });

  it('worker section : nom complet + AVS masqué + IBAN masqué', () => {
    const doc = buildPayslipDocument({
      breakdown: breakdown(),
      agency: AGENCY,
      worker: WORKER_LEGAL,
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    });
    const rows = doc.workerSection.rows;
    expect(rows.find((r) => r.label === 'Nom')?.value).toBe('Jean Dupont');
    expect(rows.find((r) => r.label === 'AVS')?.value).toBe('756.1***.****.97');
    expect(rows.find((r) => r.label === 'IBAN')?.value).toBe('CH56 **** **** **** **89');
    expect(rows.find((r) => r.label === 'Permis')?.value).toBe('C');
  });

  it('client + missionTitle ajoutés en period section si fournis', () => {
    const doc = buildPayslipDocument({
      breakdown: breakdown(),
      agency: AGENCY,
      worker: WORKER_LEGAL,
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
      clientName: 'Client SA',
      missionTitle: 'Cariste',
    });
    expect(doc.periodSection.rows.find((r) => r.label === 'Client')?.value).toBe('Client SA');
    expect(doc.periodSection.rows.find((r) => r.label === 'Mission')?.value).toBe('Cariste');
  });

  it('gross section : worked + 13e + vacances + total emphasized', () => {
    const doc = buildPayslipDocument({
      breakdown: breakdown(),
      agency: AGENCY,
      worker: WORKER_LEGAL,
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    });
    const totalRow = doc.grossSection.rows.find((r) => r.label === 'Total brut');
    expect(totalRow?.value).toBe('CHF 2333.20');
    expect(totalRow?.emphasize).toBe(true);
  });

  it("section IS absente si pas d'IS (permis C)", () => {
    const doc = buildPayslipDocument({
      breakdown: breakdown({ isCanton: null, isRappen: 0n }),
      agency: AGENCY,
      worker: WORKER_LEGAL,
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    });
    expect(doc.deductionsSection.rows.find((r) => r.label.includes('Impôt'))).toBeUndefined();
  });

  it('section IS présente avec canton si isCanton défini', () => {
    const doc = buildPayslipDocument({
      breakdown: breakdown({ isCanton: 'VD', isRappen: 5_000n }),
      agency: AGENCY,
      worker: WORKER_LEGAL,
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    });
    const isRow = doc.deductionsSection.rows.find((r) => r.label.includes('Impôt'));
    expect(isRow?.label).toContain('VD');
    expect(isRow?.value).toBe('CHF 50.00');
  });

  it('net final emphasized + arrondi 5cts mention', () => {
    const doc = buildPayslipDocument({
      breakdown: breakdown(),
      agency: AGENCY,
      worker: WORKER_LEGAL,
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    });
    const netRow = doc.netSection.rows.find((r) => r.label.includes('NET'));
    expect(netRow?.emphasize).toBe(true);
    expect(netRow?.value).toBe('CHF 2106.70');
  });

  it('quittance reprend NET + IBAN + mode virement', () => {
    const doc = buildPayslipDocument({
      breakdown: breakdown(),
      agency: AGENCY,
      worker: WORKER_LEGAL,
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    });
    const rows = doc.quittanceSection.rows;
    expect(rows[0]?.value).toContain('2106.70');
    expect(rows[1]?.value).toBe('CH56 **** **** **** **89');
    expect(rows[2]?.value).toContain('Virement');
  });

  it('footer : version moteur + conservation 10 ans', () => {
    const doc = buildPayslipDocument({
      breakdown: breakdown(),
      agency: AGENCY,
      worker: WORKER_LEGAL,
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    });
    expect(doc.footerLines[0]).toContain('1.0.0');
    expect(doc.footerLines[0]).toContain('2026');
    expect(doc.footerLines[1]).toContain('10 ans');
  });

  it('ajustement arrondi affiché signed (+ ou -)', () => {
    const doc = buildPayslipDocument({
      breakdown: breakdown({
        round5AdjustmentRappen: -2n,
        netBeforeRoundingRappen: 210_672n,
        netRappen: 210_670n,
      }),
      agency: AGENCY,
      worker: WORKER_LEGAL,
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    });
    const adjRow = doc.netSection.rows.find((r) => r.label.includes('Ajustement'));
    expect(adjRow?.value).toBe('-CHF 0.02');
  });
});
