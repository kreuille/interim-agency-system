import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildPayslipDocument, asStaffId, type PayslipBreakdown } from '@interim/domain';
import { PdfLibPayslipRenderer } from './payslip-renderer.js';

const WORKER = asStaffId('worker-1');

function breakdown(): PayslipBreakdown {
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
  };
}

function makeDoc() {
  return buildPayslipDocument({
    breakdown: breakdown(),
    agency: {
      name: 'Acme Intérim',
      ide: 'CHE-100.000.001',
      lseAuthorization: 'GE-LSE-2024-001',
      addressLine1: 'Rue du Stand 12',
      postalCode: '1204',
      city: 'Genève',
      canton: 'GE',
    },
    worker: {
      firstName: 'Jean',
      lastName: 'Dupont',
      avs: '756.1234.5678.97',
      iban: 'CH56 0900 0000 1234 5678 9',
      permit: 'C',
    },
    periodFromIso: '2026-04-20',
    periodToIso: '2026-04-26',
    clientName: 'Client SA',
    missionTitle: 'Cariste',
  });
}

describe('PdfLibPayslipRenderer', () => {
  const renderer = new PdfLibPayslipRenderer();

  it('produit un PDF valide reparseable + getTitle correct', async () => {
    const doc = makeDoc();
    const out = await renderer.render(doc);
    expect(out.bytes.length).toBeGreaterThan(500);
    const reparsed = await PDFDocument.load(out.bytes);
    expect(reparsed.getTitle()).toBe('Bulletin de salaire');
    expect(reparsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(out.sha256Hex).toMatch(/^[0-9a-f]{64}$/);
  });

  it('hash déterministe sur 2 renders identiques', async () => {
    const doc = makeDoc();
    const r1 = await renderer.render(doc);
    const r2 = await renderer.render(doc);
    expect(r1.sha256Hex).toBe(r2.sha256Hex);
  });

  it('hash diffère si net change', async () => {
    const r1 = await renderer.render(makeDoc());
    const docDifferent = buildPayslipDocument({
      breakdown: { ...breakdown(), netRappen: 999_999n },
      agency: {
        name: 'Acme',
        ide: 'CHE-100.000.001',
        lseAuthorization: 'X',
        addressLine1: 'X',
        postalCode: '1',
        city: 'X',
        canton: 'GE',
      },
      worker: { firstName: 'J', lastName: 'D', avs: '756.1234.5678.97' },
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    });
    const r2 = await renderer.render(docDifferent);
    expect(r1.sha256Hex).not.toBe(r2.sha256Hex);
  });
});
