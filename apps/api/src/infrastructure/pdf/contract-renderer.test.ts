import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { FR_DEMENAGEMENT_TEMPLATE, type ContractLegalSnapshot } from '@interim/domain';
import { PdfLibContractRenderer } from './contract-renderer.js';

const legal: ContractLegalSnapshot = {
  agencyName: 'Acme Intérim SA',
  agencyIde: 'CHE-100.000.001',
  agencyLseAuthorization: 'GE-LSE-2024-001',
  agencyLseExpiresAt: new Date('2027-04-22T00:00:00Z'),
  clientName: 'Client SA',
  clientIde: 'CHE-200.000.001',
  workerFirstName: 'Jean',
  workerLastName: 'Dupont',
  workerAvs: '756.1234.5678.97',
  missionTitle: 'Cariste',
  siteAddress: 'Rue 1, 1204 Genève',
  canton: 'GE',
  cctReference: 'CCT Construction',
  hourlyRateRappen: 3200,
  startsAt: new Date('2026-04-25T07:00:00Z'),
  endsAt: new Date('2026-04-25T16:00:00Z'),
  weeklyHours: 9,
};

function buildDoc() {
  return FR_DEMENAGEMENT_TEMPLATE.build({
    reference: 'MC-2026-04-001',
    branch: 'demenagement',
    legal,
  });
}

describe('PdfLibContractRenderer', () => {
  it('produit un PDF valide avec hash SHA-256', async () => {
    const renderer = new PdfLibContractRenderer();
    const result = await renderer.render(buildDoc());
    expect(result.bytes.length).toBeGreaterThan(1000);
    expect(result.sha256Hex).toMatch(/^[0-9a-f]{64}$/);
    // Vérifie que pdf-lib peut re-parser son output
    const parsed = await PDFDocument.load(result.bytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(parsed.getTitle()).toContain('Contrat');
  });

  it('hash déterministe : 2 renders du même doc → même sha256', async () => {
    const renderer = new PdfLibContractRenderer();
    const r1 = await renderer.render(buildDoc());
    const r2 = await renderer.render(buildDoc());
    expect(r1.sha256Hex).toBe(r2.sha256Hex);
  });

  it('hash change si le reference change', async () => {
    const renderer = new PdfLibContractRenderer();
    const r1 = await renderer.render(buildDoc());
    const docDifferent = FR_DEMENAGEMENT_TEMPLATE.build({
      reference: 'MC-OTHER',
      branch: 'demenagement',
      legal,
    });
    const r2 = await renderer.render(docDifferent);
    expect(r1.sha256Hex).not.toBe(r2.sha256Hex);
  });
});
