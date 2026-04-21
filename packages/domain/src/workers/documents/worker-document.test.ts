import { describe, it, expect } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId } from '../../shared/ids.js';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  InvalidDocumentTransition,
  WorkerDocument,
} from './worker-document.js';

const clock = new FixedClock(new Date('2026-04-21T08:00:00Z'));

function buildDocument() {
  return WorkerDocument.create(
    {
      id: 'doc-1',
      agencyId: asAgencyId('agency-a'),
      workerId: asStaffId('staff-1'),
      type: 'permit_work',
      fileKey: 'a/b/c.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      expiresAt: new Date('2030-01-01T00:00:00Z'),
    },
    clock,
  );
}

describe('WorkerDocument', () => {
  it('enum lists', () => {
    expect(DOCUMENT_TYPES).toContain('permit_work');
    expect(DOCUMENT_STATUSES).toContain('PENDING_VALIDATION');
  });

  it('create initialises in PENDING_SCAN', () => {
    expect(buildDocument().status).toBe('PENDING_SCAN');
  });

  it('markScanned(true) → PENDING_VALIDATION', () => {
    const d = buildDocument();
    d.markScanned(true, clock);
    expect(d.status).toBe('PENDING_VALIDATION');
  });

  it('markScanned(false) → REJECTED with antivirus reason', () => {
    const d = buildDocument();
    d.markScanned(false, clock);
    expect(d.status).toBe('REJECTED');
    expect(d.toSnapshot().rejectionReason).toBe('antivirus_detected_threat');
  });

  it('validate transitions PENDING_VALIDATION → VALID', () => {
    const d = buildDocument();
    d.markScanned(true, clock);
    d.validate('user-1', clock);
    const snap = d.toSnapshot();
    expect(snap.status).toBe('VALID');
    expect(snap.validatedBy).toBe('user-1');
    expect(snap.validatedAt).toBeInstanceOf(Date);
  });

  it('validate from PENDING_SCAN throws InvalidDocumentTransition', () => {
    const d = buildDocument();
    expect(() => {
      d.validate('user-1', clock);
    }).toThrow(InvalidDocumentTransition);
  });

  it('reject with reason from PENDING_VALIDATION', () => {
    const d = buildDocument();
    d.markScanned(true, clock);
    d.reject('document_too_blurry', clock);
    expect(d.status).toBe('REJECTED');
    expect(d.toSnapshot().rejectionReason).toBe('document_too_blurry');
  });

  it('reject from VALID throws InvalidDocumentTransition', () => {
    const d = buildDocument();
    d.markScanned(true, clock);
    d.validate('user-1', clock);
    expect(() => {
      d.reject('late_reject', clock);
    }).toThrow(InvalidDocumentTransition);
  });

  it('markExpired only from VALID', () => {
    const d = buildDocument();
    d.markExpired(clock); // no-op while PENDING_SCAN
    expect(d.status).toBe('PENDING_SCAN');
    d.markScanned(true, clock);
    d.validate('u', clock);
    d.markExpired(clock);
    expect(d.status).toBe('EXPIRED');
  });

  it('archive is idempotent, sets status=ARCHIVED and archivedAt', () => {
    const d = buildDocument();
    d.archive(clock);
    expect(d.status).toBe('ARCHIVED');
    expect(d.isArchived).toBe(true);
    const first = d.toSnapshot().archivedAt?.toISOString();
    d.archive(new FixedClock(new Date('2030-01-01T00:00:00Z')));
    expect(d.toSnapshot().archivedAt?.toISOString()).toBe(first);
  });

  it('isExpiredAt compares against expiresAt', () => {
    const d = buildDocument();
    expect(d.isExpiredAt(new Date('2025-01-01T00:00:00Z'))).toBe(false);
    expect(d.isExpiredAt(new Date('2031-01-01T00:00:00Z'))).toBe(true);
  });

  it('snapshot is frozen', () => {
    const d = buildDocument();
    expect(Object.isFrozen(d.toSnapshot())).toBe(true);
  });

  it('rehydrate produces a valid document', () => {
    const source = buildDocument();
    const snap = source.toSnapshot();
    const copy = WorkerDocument.rehydrate({ ...snap });
    expect(copy.id).toBe(source.id);
    expect(copy.status).toBe(source.status);
  });
});
