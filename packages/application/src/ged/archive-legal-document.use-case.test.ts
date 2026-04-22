import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId } from '@interim/domain';
import { ArchiveLegalDocumentUseCase } from './archive-legal-document.use-case.js';
import { InMemoryLegalArchiveRepository, InMemoryLegalArchiveStorage } from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const AGENCY = asAgencyId('agency-a');

function makeCase() {
  const repo = new InMemoryLegalArchiveRepository();
  const storage = new InMemoryLegalArchiveStorage();
  const useCase = new ArchiveLegalDocumentUseCase(repo, storage, new FixedClock(NOW));
  return { repo, storage, useCase };
}

function pdfBytes(content = 'pdf-contract-1'): Uint8Array {
  return new TextEncoder().encode(content);
}

let idCounter = 0;
const fixedId = (): string => `arc-${String(++idCounter)}`;

describe('ArchiveLegalDocumentUseCase', () => {
  it('archive mission_contract → rétention 10 ans, storage set, repo insert', async () => {
    const { useCase, repo, storage } = makeCase();
    idCounter = 0;
    const result = await useCase.execute({
      agencyId: AGENCY,
      category: 'mission_contract',
      referenceEntityType: 'MissionContract',
      referenceEntityId: 'mc-1',
      bytes: pdfBytes(),
      mimeType: 'application/pdf',
      idFactory: fixedId,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.alreadyExisted).toBe(false);
      expect(result.value.retentionUntil.toISOString()).toBe('2036-04-22T08:00:00.000Z');
      expect(result.value.storageKey).toMatch(/^mem-ged:\/\//);
    }
    expect(repo.size()).toBe(1);
    expect(storage.size()).toBe(1);
  });

  it('idempotent : rejoue avec même (category, refType, refId) → alreadyExisted', async () => {
    const { useCase, repo, storage } = makeCase();
    idCounter = 10;
    const input = {
      agencyId: AGENCY,
      category: 'mission_contract' as const,
      referenceEntityType: 'MissionContract',
      referenceEntityId: 'mc-1',
      bytes: pdfBytes(),
      mimeType: 'application/pdf',
      idFactory: fixedId,
    };
    const r1 = await useCase.execute(input);
    const r2 = await useCase.execute(input);
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r1.value.entryId).toBe(r2.value.entryId);
      expect(r1.value.alreadyExisted).toBe(false);
      expect(r2.value.alreadyExisted).toBe(true);
    }
    expect(repo.size()).toBe(1);
    expect(storage.size()).toBe(1);
  });

  it('worker_legal_doc → rétention = employmentEndedAt + 2 ans', async () => {
    const { useCase } = makeCase();
    idCounter = 20;
    const result = await useCase.execute({
      agencyId: AGENCY,
      category: 'worker_legal_doc',
      referenceEntityType: 'WorkerDocument',
      referenceEntityId: 'doc-1',
      bytes: pdfBytes('permit-B-2026'),
      mimeType: 'application/pdf',
      employmentEndedAt: new Date('2028-12-31T00:00:00Z'),
      idFactory: fixedId,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.retentionUntil.toISOString()).toBe('2030-12-31T00:00:00.000Z');
    }
  });

  it('worker_legal_doc sans employmentEndedAt → retention_calc_failed', async () => {
    const { useCase } = makeCase();
    idCounter = 30;
    const result = await useCase.execute({
      agencyId: AGENCY,
      category: 'worker_legal_doc',
      referenceEntityType: 'WorkerDocument',
      referenceEntityId: 'doc-2',
      bytes: pdfBytes('permit-without-end'),
      mimeType: 'application/pdf',
      idFactory: fixedId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('retention_calc_failed');
  });

  it('bytes vide → invalid_input', async () => {
    const { useCase } = makeCase();
    const result = await useCase.execute({
      agencyId: AGENCY,
      category: 'invoice',
      referenceEntityType: 'Invoice',
      referenceEntityId: 'inv-1',
      bytes: new Uint8Array(0),
      mimeType: 'application/pdf',
      idFactory: fixedId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_input');
  });

  it("storage failure → storage_failed, pas d'entrée repo", async () => {
    const { useCase, repo, storage } = makeCase();
    storage.failNextPut = 'simulated';
    idCounter = 40;
    const result = await useCase.execute({
      agencyId: AGENCY,
      category: 'payslip',
      referenceEntityType: 'Payslip',
      referenceEntityId: 'pay-1',
      bytes: pdfBytes(),
      mimeType: 'application/pdf',
      idFactory: fixedId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('storage_failed');
    expect(repo.size()).toBe(0);
  });

  it("métadonnées propagées à l'entrée", async () => {
    const { useCase, repo } = makeCase();
    idCounter = 50;
    const r = await useCase.execute({
      agencyId: AGENCY,
      category: 'invoice',
      referenceEntityType: 'Invoice',
      referenceEntityId: 'inv-77',
      bytes: pdfBytes('invoice'),
      mimeType: 'application/pdf',
      metadata: { clientName: 'Acme SA', period: '2026-04' },
      idFactory: fixedId,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      const loaded = await repo.findById(AGENCY, r.value.entryId);
      expect(loaded?.toSnapshot().metadata.clientName).toBe('Acme SA');
      expect(loaded?.toSnapshot().metadata.period).toBe('2026-04');
    }
  });

  it('countByCategory reflète les insertions', async () => {
    const { useCase, repo } = makeCase();
    idCounter = 60;
    await useCase.execute({
      agencyId: AGENCY,
      category: 'invoice',
      referenceEntityType: 'Invoice',
      referenceEntityId: 'inv-a',
      bytes: pdfBytes('a'),
      mimeType: 'application/pdf',
      idFactory: fixedId,
    });
    await useCase.execute({
      agencyId: AGENCY,
      category: 'invoice',
      referenceEntityType: 'Invoice',
      referenceEntityId: 'inv-b',
      bytes: pdfBytes('b'),
      mimeType: 'application/pdf',
      idFactory: fixedId,
    });
    await useCase.execute({
      agencyId: AGENCY,
      category: 'payslip',
      referenceEntityType: 'Payslip',
      referenceEntityId: 'pay-x',
      bytes: pdfBytes('x'),
      mimeType: 'application/pdf',
      idFactory: fixedId,
    });
    expect(await repo.countByCategory(AGENCY, 'invoice')).toBe(2);
    expect(await repo.countByCategory(AGENCY, 'payslip')).toBe(1);
  });
});
