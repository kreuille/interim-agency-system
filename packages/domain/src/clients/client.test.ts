import { describe, it, expect } from 'vitest';
import { FixedClock, Ide, Money, Name } from '@interim/shared';
import { asAgencyId } from '../shared/ids.js';
import {
  asClientId,
  CLIENT_STATUSES,
  Client,
  CONTACT_ROLES,
  InvalidClientTransition,
} from './client.js';

const clock = new FixedClock(new Date('2026-04-22T08:00:00Z'));

function buildClient() {
  return Client.create(
    {
      id: asClientId('client-1'),
      agencyId: asAgencyId('agency-a'),
      legalName: Name.parse('Acme SA'),
      ide: Ide.parse('CHE-100.000.006'),
    },
    clock,
  );
}

describe('Client entity', () => {
  it('exposes constants for statuses and contact roles', () => {
    expect(CLIENT_STATUSES).toEqual(['prospect', 'active', 'suspended', 'churned']);
    expect(CONTACT_ROLES).toEqual(['signatory', 'billing', 'ops', 'escalation_24_7']);
  });

  it('create initialises in prospect with default payment term 30', () => {
    const c = buildClient();
    const snap = c.toSnapshot();
    expect(snap.status).toBe('prospect');
    expect(snap.paymentTermDays).toBe(30);
    expect(snap.contacts).toEqual([]);
  });

  it('valid transitions: prospect → active → suspended → active', () => {
    const c = buildClient();
    c.transitionTo('active', clock);
    expect(c.status).toBe('active');
    c.transitionTo('suspended', clock);
    expect(c.status).toBe('suspended');
    c.transitionTo('active', clock);
    expect(c.status).toBe('active');
  });

  it('rejects forbidden transition prospect → suspended', () => {
    const c = buildClient();
    expect(() => {
      c.transitionTo('suspended', clock);
    }).toThrow(InvalidClientTransition);
  });

  it('rejects any transition from churned (terminal)', () => {
    const c = buildClient();
    c.transitionTo('active', clock);
    c.transitionTo('churned', clock);
    expect(() => {
      c.transitionTo('active', clock);
    }).toThrow(InvalidClientTransition);
  });

  it('rename / changeIde / changePaymentTerms / changeCreditLimit', () => {
    const c = buildClient();
    c.rename(Name.parse('Acme Holding'), clock);
    c.changeIde(Ide.parse('CHE-200.000.001'), clock);
    c.changePaymentTerms(60, clock);
    c.changeCreditLimit(Money.fromRappen(50_000_00n), clock);
    const snap = c.toSnapshot();
    expect(snap.legalName.toString()).toBe('Acme Holding');
    expect(snap.ide?.toString()).toBe('CHE-200.000.001');
    expect(snap.paymentTermDays).toBe(60);
    expect(snap.creditLimit?.toCents()).toBe(50_000_00n);
  });

  it('changeIde to undefined removes IDE', () => {
    const c = buildClient();
    c.changeIde(undefined, clock);
    expect(c.toSnapshot().ide).toBeUndefined();
  });

  it('rejects negative or > 365 payment terms', () => {
    const c = buildClient();
    expect(() => {
      c.changePaymentTerms(-1, clock);
    }).toThrow();
    expect(() => {
      c.changePaymentTerms(366, clock);
    }).toThrow();
  });

  it('archive is idempotent and frozen', () => {
    const c = buildClient();
    c.archive(clock);
    expect(c.isArchived).toBe(true);
    const first = c.toSnapshot().archivedAt?.toISOString();
    c.archive(new FixedClock(new Date('2030-01-01')));
    expect(c.toSnapshot().archivedAt?.toISOString()).toBe(first);
    expect(Object.isFrozen(c.toSnapshot())).toBe(true);
  });

  it('setContacts replaces the list', () => {
    const c = buildClient();
    c.setContacts(
      [
        {
          id: 'c1',
          role: 'billing',
          firstName: Name.parse('Anne'),
          lastName: Name.parse('Compta'),
        },
      ],
      clock,
    );
    expect(c.toSnapshot().contacts).toHaveLength(1);
  });

  it('rehydrate produces a valid client', () => {
    const c = buildClient();
    const snap = c.toSnapshot();
    const copy = Client.rehydrate({ ...snap });
    expect(copy.id).toBe(c.id);
    expect(copy.status).toBe(c.status);
  });
});
