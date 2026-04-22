import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import { asAgencyId, asStaffId } from '../shared/ids.js';
import {
  asMissionContractId,
  ContractAlreadyTerminal,
  InvalidContractTransition,
  MissionContract,
  type ContractLegalSnapshot,
  type CreateContractInput,
} from './mission-contract.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);

function legal(overrides: Partial<ContractLegalSnapshot> = {}): ContractLegalSnapshot {
  return {
    agencyName: 'Acme Intérim SA',
    agencyIde: 'CHE-100.000.001',
    agencyLseAuthorization: 'GE-LSE-2024-001',
    agencyLseExpiresAt: new Date('2027-04-22T00:00:00Z'),
    clientName: 'Client SA',
    clientIde: 'CHE-200.000.001',
    workerFirstName: 'Jean',
    workerLastName: 'Dupont',
    workerAvs: '756.1234.5678.97',
    missionTitle: 'Cariste H24',
    siteAddress: 'Rue 1, 1204 Genève',
    canton: 'GE',
    cctReference: 'CCT Construction',
    hourlyRateRappen: 3200,
    startsAt: new Date('2026-04-25T07:00:00Z'),
    endsAt: new Date('2026-04-25T16:00:00Z'),
    weeklyHours: 9,
    ...overrides,
  };
}

function input(overrides: Partial<CreateContractInput> = {}): CreateContractInput {
  return {
    id: asMissionContractId('mc-1'),
    agencyId: asAgencyId('agency-a'),
    workerId: asStaffId('worker-1'),
    proposalId: 'mp-1',
    reference: 'MC-2026-04-001',
    branch: 'CCT Construction',
    legal: legal(),
    clock,
    ...overrides,
  };
}

describe('MissionContract.create', () => {
  it('initialise à `draft`', () => {
    const c = MissionContract.create(input());
    expect(c.state).toBe('draft');
    expect(c.reference).toBe('MC-2026-04-001');
  });

  it('rejette endsAt <= startsAt', () => {
    expect(() =>
      MissionContract.create(
        input({
          legal: legal({
            startsAt: new Date('2026-04-25T17:00:00Z'),
            endsAt: new Date('2026-04-25T09:00:00Z'),
          }),
        }),
      ),
    ).toThrow();
  });

  it('rejette hourlyRateRappen <= 0', () => {
    expect(() =>
      MissionContract.create(input({ legal: legal({ hourlyRateRappen: 0 }) })),
    ).toThrow();
  });

  it('rejette weeklyHours > 50 (LTr)', () => {
    expect(() => MissionContract.create(input({ legal: legal({ weeklyHours: 51 }) }))).toThrow();
  });

  it('rejette weeklyHours <= 0', () => {
    expect(() => MissionContract.create(input({ legal: legal({ weeklyHours: 0 }) }))).toThrow();
  });

  it('rejette LSE qui expire avant la fin de mission', () => {
    expect(() =>
      MissionContract.create(
        input({
          legal: legal({
            agencyLseExpiresAt: new Date('2026-04-25T15:00:00Z'),
            endsAt: new Date('2026-04-25T16:00:00Z'),
          }),
        }),
      ),
    ).toThrow(/LSE/);
  });
});

describe('MissionContract FSM', () => {
  it('draft → sent_for_signature → signed', () => {
    const c = MissionContract.create(input());
    c.sendForSignature('zertes-env-1', clock);
    expect(c.state).toBe('sent_for_signature');
    expect(c.toSnapshot().zertesEnvelopeId).toBe('zertes-env-1');
    c.markSigned({ signedPdfKey: 'gcs://bucket/contract-mc-1.pdf' }, clock);
    expect(c.state).toBe('signed');
    expect(c.toSnapshot().signedPdfKey).toBe('gcs://bucket/contract-mc-1.pdf');
    expect(c.isTerminal).toBe(true);
  });

  it('draft → cancelled avec raison', () => {
    const c = MissionContract.create(input());
    c.cancel('Worker plus disponible', clock);
    expect(c.state).toBe('cancelled');
    expect(c.toSnapshot().cancelReason).toBe('Worker plus disponible');
  });

  it('draft → signed (saut interdit)', () => {
    const c = MissionContract.create(input());
    expect(() => {
      c.markSigned({ signedPdfKey: 'k' }, clock);
    }).toThrow(InvalidContractTransition);
  });

  it('signed → cancelled interdit (terminal)', () => {
    const c = MissionContract.create(input());
    c.sendForSignature('z', clock);
    c.markSigned({ signedPdfKey: 'k' }, clock);
    expect(() => {
      c.cancel('reason', clock);
    }).toThrow(ContractAlreadyTerminal);
  });

  it('cancelled → sent_for_signature interdit', () => {
    const c = MissionContract.create(input());
    c.cancel('x', clock);
    expect(() => {
      c.sendForSignature('z', clock);
    }).toThrow(ContractAlreadyTerminal);
  });
});

describe('MissionContract.rehydrate', () => {
  it('snapshot puis rehydrate conserve l’état', () => {
    const c = MissionContract.create(input());
    c.sendForSignature('z', clock);
    const snap = c.toSnapshot();
    const copy = MissionContract.rehydrate({ ...snap });
    expect(copy.state).toBe('sent_for_signature');
    expect(copy.id).toBe(c.id);
  });
});
