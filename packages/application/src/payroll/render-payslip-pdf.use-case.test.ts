import { describe, expect, it } from 'vitest';
import { asStaffId, type PayslipBreakdown } from '@interim/domain';
import { RenderPayslipPdfUseCase } from './render-payslip-pdf.use-case.js';
import { InMemoryPayslipPdfStorage, StubPayslipPdfRenderer } from './test-helpers.js';

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

describe('RenderPayslipPdfUseCase', () => {
  it('happy path : rend PDF + stocke', async () => {
    const renderer = new StubPayslipPdfRenderer();
    const storage = new InMemoryPayslipPdfStorage();
    const useCase = new RenderPayslipPdfUseCase(renderer, storage);
    const result = await useCase.execute({
      agencyId: 'agency-a',
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
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.storageKey).toMatch(/^mem-payslip:\/\//);
      expect(result.value.sha256Hex).toMatch(/^[0-9a-f]{64}$/);
      expect(result.value.bytesLength).toBeGreaterThan(0);
    }
    expect(storage.stored.size).toBe(1);
  });

  it('idempotent : 2 appels même breakdown → même hash (sérialisation déterministe)', async () => {
    const renderer = new StubPayslipPdfRenderer();
    const storage = new InMemoryPayslipPdfStorage();
    const useCase = new RenderPayslipPdfUseCase(renderer, storage);
    const input = {
      agencyId: 'agency-a',
      breakdown: breakdown(),
      agency: {
        name: 'Acme',
        ide: 'CHE-100.000.001',
        lseAuthorization: 'GE-LSE-2024-001',
        addressLine1: 'Rue 1',
        postalCode: '1204',
        city: 'GE',
        canton: 'GE',
      },
      worker: {
        firstName: 'Jean',
        lastName: 'D',
        avs: '756.1234.5678.97',
      },
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    };
    const r1 = await useCase.execute(input);
    const r2 = await useCase.execute(input);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.sha256Hex).toBe(r2.value.sha256Hex);
    }
  });

  it('renderer fail → render_failed', async () => {
    const renderer: StubPayslipPdfRenderer = new StubPayslipPdfRenderer();
    renderer.render = (): never => {
      throw new Error('boom');
    };
    const storage = new InMemoryPayslipPdfStorage();
    const useCase = new RenderPayslipPdfUseCase(renderer, storage);
    const result = await useCase.execute({
      agencyId: 'agency-a',
      breakdown: breakdown(),
      agency: {
        name: 'X',
        ide: 'CHE-100.000.001',
        lseAuthorization: 'L',
        addressLine1: 'R',
        postalCode: '1',
        city: 'G',
        canton: 'GE',
      },
      worker: { firstName: 'J', lastName: 'D', avs: '756.1234.5678.97' },
      periodFromIso: '2026-04-20',
      periodToIso: '2026-04-26',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('render_failed');
  });
});
