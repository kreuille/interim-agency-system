import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId } from '../shared/ids.js';
import {
  asMissionProposalId,
  InvalidProposalTransition,
  MissionProposal,
  ProposalAlreadyTerminal,
  type CreateProposalInput,
  type ProposalState,
} from './mission-proposal.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);

function baseInput(overrides: Partial<CreateProposalInput> = {}): CreateProposalInput {
  return {
    id: asMissionProposalId('mp-1'),
    agencyId: asAgencyId('agency-a'),
    externalRequestId: 'mp-req-1',
    workerId: asStaffId('worker-1'),
    missionSnapshot: {
      title: 'Cariste H24',
      clientName: 'ACME SA',
      siteAddress: 'Rue du Stand 1, 1204 Genève',
      canton: 'GE',
      cctReference: 'CCT Construction',
      hourlyRateRappen: 3200,
      startsAt: new Date('2026-04-25T07:00:00Z'),
      endsAt: new Date('2026-04-25T16:00:00Z'),
      skillsRequired: ['cariste', 'permis M'],
    },
    proposedAt: NOW,
    responseDeadline: new Date(NOW.getTime() + 30 * 60 * 1000),
    clock,
    ...overrides,
  };
}

describe('MissionProposal.create', () => {
  it('initialise à l’état `proposed`', () => {
    const p = MissionProposal.create(baseInput());
    expect(p.state).toBe('proposed');
    expect(p.toSnapshot().routingMode).toBeUndefined();
  });

  it('rejette endsAt <= startsAt', () => {
    expect(() =>
      MissionProposal.create(
        baseInput({
          missionSnapshot: {
            title: 't',
            clientName: 'c',
            siteAddress: 'a',
            canton: 'GE',
            hourlyRateRappen: 3000,
            startsAt: new Date('2026-04-25T17:00:00Z'),
            endsAt: new Date('2026-04-25T09:00:00Z'),
            skillsRequired: [],
          },
        }),
      ),
    ).toThrow();
  });

  it('rejette hourlyRateRappen <= 0', () => {
    expect(() =>
      MissionProposal.create(
        baseInput({
          missionSnapshot: {
            title: 't',
            clientName: 'c',
            siteAddress: 'a',
            canton: 'GE',
            hourlyRateRappen: 0,
            startsAt: new Date('2026-04-25T07:00:00Z'),
            endsAt: new Date('2026-04-25T16:00:00Z'),
            skillsRequired: [],
          },
        }),
      ),
    ).toThrow();
  });
});

describe('MissionProposal FSM', () => {
  it('proposed → pass_through_sent ok', () => {
    const p = MissionProposal.create(baseInput());
    p.assignRoutingMode('pass_through', clock);
    p.transitionTo('pass_through_sent', {}, clock);
    expect(p.state).toBe('pass_through_sent');
  });

  it('proposed → agency_review ok', () => {
    const p = MissionProposal.create(baseInput());
    p.assignRoutingMode('agency_controlled', clock);
    p.transitionTo('agency_review', {}, clock);
    expect(p.state).toBe('agency_review');
  });

  it('proposed → accepted invalide (saut)', () => {
    const p = MissionProposal.create(baseInput());
    expect(() => {
      p.transitionTo('accepted', {}, clock);
    }).toThrow(InvalidProposalTransition);
  });

  it('pass_through_sent → accepted ok avec acceptedAt', () => {
    const p = MissionProposal.create(baseInput());
    p.transitionTo('pass_through_sent', {}, clock);
    p.transitionTo('accepted', { reason: 'worker accepted via SMS' }, clock);
    const snap = p.toSnapshot();
    expect(snap.state).toBe('accepted');
    expect(snap.acceptedAt).toEqual(NOW);
    expect(snap.responseReason).toBe('worker accepted via SMS');
  });

  it('pass_through_sent → timeout → terminal', () => {
    const p = MissionProposal.create(baseInput());
    p.transitionTo('pass_through_sent', {}, clock);
    p.transitionTo('timeout', {}, clock);
    expect(p.state).toBe('timeout');
    expect(p.isTerminal).toBe(true);
    expect(() => {
      p.transitionTo('accepted', {}, clock);
    }).toThrow(ProposalAlreadyTerminal);
  });

  it('agency_review → refused avec reason', () => {
    const p = MissionProposal.create(baseInput());
    p.transitionTo('agency_review', {}, clock);
    p.transitionTo('refused', { reason: 'permis expiré' }, clock);
    const snap = p.toSnapshot();
    expect(snap.state).toBe('refused');
    expect(snap.refusedAt).toEqual(NOW);
    expect(snap.responseReason).toBe('permis expiré');
  });

  it('routingMode ne peut être défini qu’une seule fois', () => {
    const p = MissionProposal.create(baseInput());
    p.assignRoutingMode('pass_through', clock);
    expect(() => {
      p.assignRoutingMode('agency_controlled', clock);
    }).toThrow();
  });

  it('assignRoutingMode interdit à l’état terminal', () => {
    const p = MissionProposal.create(baseInput());
    p.transitionTo('pass_through_sent', {}, clock);
    p.transitionTo('accepted', {}, clock);
    expect(() => {
      p.assignRoutingMode('pass_through', clock);
    }).toThrow(ProposalAlreadyTerminal);
  });

  it('matrice complète des transitions invalides', () => {
    const invalidPairs: readonly (readonly [ProposalState, ProposalState])[] = [
      ['proposed', 'accepted'],
      ['proposed', 'timeout'],
      ['pass_through_sent', 'proposed'],
      ['agency_review', 'timeout'],
      ['agency_review', 'pass_through_sent'],
    ];
    for (const [from, to] of invalidPairs) {
      const p = MissionProposal.create(baseInput());
      if (from !== 'proposed') {
        // Route rapide vers `from`
        if (from === 'pass_through_sent') p.transitionTo('pass_through_sent', {}, clock);
        else if (from === 'agency_review') p.transitionTo('agency_review', {}, clock);
      }
      expect(() => {
        p.transitionTo(to, {}, clock);
      }).toThrow(InvalidProposalTransition);
    }
  });
});

describe('MissionProposal.expireIfDue', () => {
  it('avant deadline → no-op', () => {
    const p = MissionProposal.create(baseInput());
    const before = new FixedClock(new Date(NOW.getTime() + 5 * 60 * 1000));
    expect(p.expireIfDue(before)).toBe(false);
    expect(p.state).toBe('proposed');
  });

  it('après deadline → timeout', () => {
    const p = MissionProposal.create(baseInput());
    const after = new FixedClock(new Date(NOW.getTime() + 31 * 60 * 1000));
    expect(p.expireIfDue(after)).toBe(true);
    expect(p.state).toBe('timeout');
  });

  it('idempotent si déjà terminal', () => {
    const p = MissionProposal.create(baseInput());
    p.transitionTo('pass_through_sent', {}, clock);
    p.transitionTo('accepted', {}, clock);
    const after = new FixedClock(new Date(NOW.getTime() + 31 * 60 * 1000));
    expect(p.expireIfDue(after)).toBe(false);
    expect(p.state).toBe('accepted');
  });

  it('sans responseDeadline → no-op', () => {
    const { responseDeadline: _drop, ...withoutDeadline } = baseInput();
    void _drop;
    const p = MissionProposal.create(withoutDeadline);
    expect(p.expireIfDue(new FixedClock(new Date(NOW.getTime() + 365 * 24 * 3600 * 1000)))).toBe(
      false,
    );
  });
});

describe('MissionProposal rehydrate', () => {
  it('snapshot puis rehydrate conserve l’état', () => {
    const p = MissionProposal.create(baseInput());
    p.transitionTo('pass_through_sent', {}, clock);
    const snap = p.toSnapshot();
    const copy = MissionProposal.rehydrate({ ...snap });
    expect(copy.state).toBe('pass_through_sent');
    expect(copy.id).toBe(p.id);
  });
});
