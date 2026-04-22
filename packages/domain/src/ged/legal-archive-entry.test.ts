import { describe, expect, it } from 'vitest';
import { asAgencyId } from '../shared/ids.js';
import {
  computeRetentionUntil,
  LegalArchiveEntry,
  LegalArchiveError,
  RETENTION_YEARS_BY_CATEGORY,
} from './legal-archive-entry.js';

const SHA = 'a'.repeat(64);
const AGENCY = asAgencyId('agency-a');
const ARCHIVED = new Date('2026-04-22T08:00:00Z');

describe('computeRetentionUntil', () => {
  it('mission_contract → archivedAt + 10 ans', () => {
    const r = computeRetentionUntil({ category: 'mission_contract', archivedAt: ARCHIVED });
    expect(r.toISOString()).toBe('2036-04-22T08:00:00.000Z');
  });

  it('payslip → archivedAt + 5 ans', () => {
    const r = computeRetentionUntil({ category: 'payslip', archivedAt: ARCHIVED });
    expect(r.toISOString()).toBe('2031-04-22T08:00:00.000Z');
  });

  it('invoice → archivedAt + 10 ans (CO 958f)', () => {
    const r = computeRetentionUntil({ category: 'invoice', archivedAt: ARCHIVED });
    expect(r.toISOString()).toBe('2036-04-22T08:00:00.000Z');
  });

  it('timesheet → archivedAt + 5 ans', () => {
    const r = computeRetentionUntil({ category: 'timesheet', archivedAt: ARCHIVED });
    expect(r.toISOString()).toBe('2031-04-22T08:00:00.000Z');
  });

  it('worker_legal_doc → employmentEndedAt + 2 ans', () => {
    const r = computeRetentionUntil({
      category: 'worker_legal_doc',
      archivedAt: ARCHIVED,
      employmentEndedAt: new Date('2027-01-15T00:00:00Z'),
    });
    expect(r.toISOString()).toBe('2029-01-15T00:00:00.000Z');
  });

  it('worker_legal_doc sans employmentEndedAt → LegalArchiveError', () => {
    expect(() =>
      computeRetentionUntil({ category: 'worker_legal_doc', archivedAt: ARCHIVED }),
    ).toThrow(LegalArchiveError);
  });

  it('table de rétention conforme aux règles légales', () => {
    expect(RETENTION_YEARS_BY_CATEGORY.mission_contract).toBe(10);
    expect(RETENTION_YEARS_BY_CATEGORY.invoice).toBe(10);
    expect(RETENTION_YEARS_BY_CATEGORY.payslip).toBe(5);
    expect(RETENTION_YEARS_BY_CATEGORY.timesheet).toBe(5);
    expect(RETENTION_YEARS_BY_CATEGORY.worker_legal_doc).toBe(2);
  });
});

describe('LegalArchiveEntry', () => {
  function baseInput() {
    return {
      id: 'arc-1',
      agencyId: AGENCY,
      category: 'mission_contract' as const,
      referenceEntityType: 'MissionContract',
      referenceEntityId: 'mc-1',
      storageKey: 'gs://interim-ged/agency-a/mission_contract/2026/mc-1/file.pdf',
      sha256Hex: SHA,
      sizeBytes: 12345,
      mimeType: 'application/pdf',
      archivedAt: ARCHIVED,
    };
  }

  it('create() calcule retentionUntil = archivedAt + 10 ans', () => {
    const e = LegalArchiveEntry.create(baseInput());
    expect(e.retentionUntil.toISOString()).toBe('2036-04-22T08:00:00.000Z');
    expect(e.category).toBe('mission_contract');
  });

  it('rejette sizeBytes <= 0', () => {
    expect(() => LegalArchiveEntry.create({ ...baseInput(), sizeBytes: 0 })).toThrow(
      LegalArchiveError,
    );
  });

  it('rejette sha256 mal formé', () => {
    expect(() => LegalArchiveEntry.create({ ...baseInput(), sha256Hex: 'zzz' })).toThrow(
      LegalArchiveError,
    );
  });

  it('isPurgeable: false avant retention, true après', () => {
    const e = LegalArchiveEntry.create(baseInput());
    expect(e.isPurgeable(new Date('2030-01-01T00:00:00Z'))).toBe(false);
    expect(e.isPurgeable(new Date('2036-04-22T08:00:00Z'))).toBe(true);
    expect(e.isPurgeable(new Date('2036-04-23T00:00:00Z'))).toBe(true);
  });

  it('worker_legal_doc avec employmentEndedAt → retention = end + 2', () => {
    const e = LegalArchiveEntry.create({
      ...baseInput(),
      category: 'worker_legal_doc',
      referenceEntityType: 'WorkerDocument',
      employmentEndedAt: new Date('2030-06-30T00:00:00Z'),
    });
    expect(e.retentionUntil.toISOString()).toBe('2032-06-30T00:00:00.000Z');
  });

  it('toSnapshot() expose tous les champs', () => {
    const e = LegalArchiveEntry.create({ ...baseInput(), metadata: { ref: 'MC-001' } });
    const s = e.toSnapshot();
    expect(s.id).toBe('arc-1');
    expect(s.metadata.ref).toBe('MC-001');
    expect(s.archivedAt).toEqual(ARCHIVED);
  });

  it('fromPersistence() reconstruit sans recalcul', () => {
    const customRetention = new Date('2099-12-31T23:59:59Z');
    const e = LegalArchiveEntry.fromPersistence({
      id: 'arc-2',
      agencyId: AGENCY,
      category: 'invoice',
      referenceEntityType: 'Invoice',
      referenceEntityId: 'inv-1',
      storageKey: 'gs://x/y',
      sha256Hex: SHA,
      sizeBytes: 100,
      mimeType: 'application/pdf',
      archivedAt: ARCHIVED,
      retentionUntil: customRetention,
      metadata: {},
    });
    expect(e.retentionUntil).toBe(customRetention);
  });
});
