import { describe, it, expect, beforeEach } from 'vitest';
import { asAgencyId } from '@interim/domain';
import { FixedClock } from '@interim/shared';
import { RegisterWorkerUseCase } from './register-worker.use-case.js';
import { InMemoryAuditLogger, InMemoryWorkerRepository } from './test-helpers.js';

const clock = new FixedClock(new Date('2026-04-21T08:00:00Z'));

let repo: InMemoryWorkerRepository;
let audit: InMemoryAuditLogger;
let useCase: RegisterWorkerUseCase;
let idCounter = 0;

beforeEach(() => {
  repo = new InMemoryWorkerRepository();
  audit = new InMemoryAuditLogger();
  idCounter = 0;
  useCase = new RegisterWorkerUseCase(repo, audit, clock, () => `worker-${String(++idCounter)}`);
});

const validInput = {
  agencyId: asAgencyId('agency-a'),
  actorUserId: 'user-1',
  firstName: 'Jean',
  lastName: 'Dupont',
  avs: '756.1234.5678.97',
  iban: 'CH9300762011623852957',
  residenceCanton: 'GE',
  email: 'jean@example.ch',
  phone: '+41780000001',
};

describe('RegisterWorkerUseCase', () => {
  it('creates a worker and writes an audit entry', async () => {
    const result = await useCase.execute(validInput);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workerId).toBe('worker-1');
    }
    expect(repo.count()).toBe(1);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]?.kind).toBe('WorkerRegistered');
  });

  it('refuses a duplicate AVS within the same agency', async () => {
    await useCase.execute(validInput);
    const result = await useCase.execute(validInput);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('duplicate_avs');
    }
    expect(repo.count()).toBe(1);
  });

  it('allows same AVS in a different agency (tenant isolation)', async () => {
    await useCase.execute(validInput);
    const otherAgency = await useCase.execute({ ...validInput, agencyId: asAgencyId('agency-b') });
    expect(otherAgency.ok).toBe(true);
    expect(repo.count()).toBe(2);
  });

  it('rejects invalid AVS', async () => {
    await expect(useCase.execute({ ...validInput, avs: 'not-valid' })).rejects.toThrow();
  });

  it('rejects invalid IBAN', async () => {
    await expect(useCase.execute({ ...validInput, iban: 'not-valid' })).rejects.toThrow();
  });
});
