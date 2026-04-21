import { describe, it, expect, beforeEach } from 'vitest';
import { asAgencyId } from '@interim/domain';
import { FixedClock } from '@interim/shared';
import { ArchiveWorkerUseCase } from './archive-worker.use-case.js';
import { GetWorkerUseCase } from './get-worker.use-case.js';
import { ListWorkersUseCase } from './list-workers.use-case.js';
import { RegisterWorkerUseCase } from './register-worker.use-case.js';
import { UpdateWorkerUseCase } from './update-worker.use-case.js';
import { InMemoryAuditLogger, InMemoryWorkerRepository } from './test-helpers.js';

const clock = new FixedClock(new Date('2026-04-21T08:00:00Z'));
const AGENCY = asAgencyId('agency-a');

let repo: InMemoryWorkerRepository;
let audit: InMemoryAuditLogger;
let register: RegisterWorkerUseCase;
let update: UpdateWorkerUseCase;
let archive: ArchiveWorkerUseCase;
let get: GetWorkerUseCase;
let list: ListWorkersUseCase;

beforeEach(() => {
  repo = new InMemoryWorkerRepository();
  audit = new InMemoryAuditLogger();
  register = new RegisterWorkerUseCase(repo, audit, clock, () => 'worker-42');
  update = new UpdateWorkerUseCase(repo, audit, clock);
  archive = new ArchiveWorkerUseCase(repo, audit, clock);
  get = new GetWorkerUseCase(repo);
  list = new ListWorkersUseCase(repo);
});

const base = {
  agencyId: AGENCY,
  firstName: 'Jean',
  lastName: 'Dupont',
  avs: '756.1234.5678.97',
  iban: 'CH9300762011623852957',
  residenceCanton: 'GE',
};

describe('UpdateWorkerUseCase', () => {
  it('updates name and writes audit', async () => {
    await register.execute(base);
    const result = await update.execute({
      agencyId: AGENCY,
      workerId: 'worker-42',
      firstName: 'Jeanne',
    });
    expect(result.ok).toBe(true);
    expect(audit.entries.filter((e) => e.kind === 'WorkerUpdated')).toHaveLength(1);
  });

  it('returns worker_not_found for unknown id', async () => {
    const result = await update.execute({ agencyId: AGENCY, workerId: 'ghost' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('worker_not_found');
  });

  it('returns worker_not_found cross-tenant (agency B cannot update agency A worker)', async () => {
    await register.execute(base);
    const result = await update.execute({
      agencyId: asAgencyId('agency-b'),
      workerId: 'worker-42',
      firstName: 'Jeanne',
    });
    expect(result.ok).toBe(false);
  });
});

describe('ArchiveWorkerUseCase', () => {
  it('archives and writes audit', async () => {
    await register.execute(base);
    const result = await archive.execute({ agencyId: AGENCY, workerId: 'worker-42' });
    expect(result.ok).toBe(true);
    expect(audit.entries.filter((e) => e.kind === 'WorkerArchived')).toHaveLength(1);
  });

  it('second archive is idempotent (no second audit entry)', async () => {
    await register.execute(base);
    await archive.execute({ agencyId: AGENCY, workerId: 'worker-42' });
    await archive.execute({ agencyId: AGENCY, workerId: 'worker-42' });
    expect(audit.entries.filter((e) => e.kind === 'WorkerArchived')).toHaveLength(1);
  });
});

describe('GetWorkerUseCase', () => {
  it('returns 404 after archival by default', async () => {
    await register.execute(base);
    await archive.execute({ agencyId: AGENCY, workerId: 'worker-42' });
    const result = await get.execute({ agencyId: AGENCY, workerId: 'worker-42' });
    expect(result.ok).toBe(false);
  });

  it('returns archived worker when includeArchived=true', async () => {
    await register.execute(base);
    await archive.execute({ agencyId: AGENCY, workerId: 'worker-42' });
    const result = await get.execute({
      agencyId: AGENCY,
      workerId: 'worker-42',
      includeArchived: true,
    });
    expect(result.ok).toBe(true);
  });
});

describe('ListWorkersUseCase', () => {
  it('filters by tenant', async () => {
    await register.execute(base);
    const otherRegister = new RegisterWorkerUseCase(repo, audit, clock, () => 'worker-99');
    await otherRegister.execute({
      ...base,
      agencyId: asAgencyId('agency-b'),
      avs: '756.9217.0769.85',
    });

    const pageA = await list.execute({ agencyId: AGENCY });
    expect(pageA.items).toHaveLength(1);

    const pageB = await list.execute({ agencyId: asAgencyId('agency-b') });
    expect(pageB.items).toHaveLength(1);
  });

  it('excludes archived by default', async () => {
    await register.execute(base);
    await archive.execute({ agencyId: AGENCY, workerId: 'worker-42' });

    const page = await list.execute({ agencyId: AGENCY });
    expect(page.items).toHaveLength(0);

    const withArchived = await list.execute({ agencyId: AGENCY, includeArchived: true });
    expect(withArchived.items).toHaveLength(1);
  });
});
