import { describe, it, expect } from 'vitest';
import { Avs, FixedClock, Email, Iban, Name, Phone, parseCanton } from '@interim/shared';
import { TempWorker } from './temp-worker.js';
import { asAgencyId, asStaffId } from '../shared/ids.js';

const clock = new FixedClock(new Date('2026-04-21T08:00:00Z'));

function buildWorker(): TempWorker {
  return TempWorker.create(
    {
      id: asStaffId('staff-1'),
      agencyId: asAgencyId('agency-a'),
      firstName: Name.parse('Jean'),
      lastName: Name.parse('Dupont'),
      avs: Avs.parse('756.1234.5678.97'),
      iban: Iban.parse('CH9300762011623852957'),
      residenceCanton: parseCanton('GE'),
      email: Email.parse('jean@example.ch'),
      phone: Phone.parse('+41780000001'),
    },
    clock,
  );
}

describe('TempWorker', () => {
  it('create sets createdAt and updatedAt to clock.now', () => {
    const worker = buildWorker();
    const snap = worker.toSnapshot();
    expect(snap.createdAt.toISOString()).toBe('2026-04-21T08:00:00.000Z');
    expect(snap.updatedAt.toISOString()).toBe('2026-04-21T08:00:00.000Z');
    expect(snap.archivedAt).toBeUndefined();
  });

  it('rename updates both names and updatedAt', () => {
    const worker = buildWorker();
    const later = new FixedClock(new Date('2026-04-21T09:00:00Z'));
    worker.rename(Name.parse('Jeanne'), Name.parse('Durant'), later);
    const snap = worker.toSnapshot();
    expect(snap.firstName.toString()).toBe('Jeanne');
    expect(snap.lastName.toString()).toBe('Durant');
    expect(snap.updatedAt.toISOString()).toBe('2026-04-21T09:00:00.000Z');
  });

  it('changeIban + changeResidenceCanton', () => {
    const worker = buildWorker();
    worker.changeIban(Iban.parse('CH9300762011623852957'), clock);
    worker.changeResidenceCanton(parseCanton('VD'), clock);
    expect(worker.toSnapshot().residenceCanton).toBe('VD');
  });

  it('changeEmail to undefined removes the email', () => {
    const worker = buildWorker();
    worker.changeEmail(undefined, clock);
    expect(worker.toSnapshot().email).toBeUndefined();
  });

  it('archive sets archivedAt and isArchived', () => {
    const worker = buildWorker();
    worker.archive(clock);
    expect(worker.isArchived).toBe(true);
    expect(worker.toSnapshot().archivedAt).toBeInstanceOf(Date);
  });

  it('archive is idempotent (second call does not move archivedAt)', () => {
    const worker = buildWorker();
    worker.archive(clock);
    const first = worker.toSnapshot().archivedAt?.toISOString();
    const later = new FixedClock(new Date('2026-04-22T00:00:00Z'));
    worker.archive(later);
    expect(worker.toSnapshot().archivedAt?.toISOString()).toBe(first);
  });

  it('snapshot is frozen', () => {
    const worker = buildWorker();
    const snap = worker.toSnapshot();
    expect(Object.isFrozen(snap)).toBe(true);
  });
});
