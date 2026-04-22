import { describe, it, expect, beforeEach } from 'vitest';
import { asAgencyId, ClientNotFound, DuplicateClientIde } from '@interim/domain';
import { FixedClock } from '@interim/shared';
import { ArchiveClientUseCase } from './archive-client.use-case.js';
import { GetClientUseCase } from './get-client.use-case.js';
import { ListClientsUseCase } from './list-clients.use-case.js';
import { RegisterClientUseCase } from './register-client.use-case.js';
import { UpdateClientUseCase } from './update-client.use-case.js';
import { InMemoryClientAuditLogger, InMemoryClientRepository } from './test-helpers.js';

const AGENCY = asAgencyId('agency-a');
const clock = new FixedClock(new Date('2026-04-22T08:00:00Z'));

let repo: InMemoryClientRepository;
let audit: InMemoryClientAuditLogger;
let register: RegisterClientUseCase;
let update: UpdateClientUseCase;
let archive: ArchiveClientUseCase;
let getCase: GetClientUseCase;
let list: ListClientsUseCase;
let counter = 0;

beforeEach(() => {
  repo = new InMemoryClientRepository();
  audit = new InMemoryClientAuditLogger();
  counter = 0;
  register = new RegisterClientUseCase(repo, audit, clock, () => `client-${String(++counter)}`);
  update = new UpdateClientUseCase(repo, audit, clock);
  archive = new ArchiveClientUseCase(repo, audit, clock);
  getCase = new GetClientUseCase(repo);
  list = new ListClientsUseCase(repo);
});

const valid = {
  agencyId: AGENCY,
  legalName: 'Acme SA',
  ide: 'CHE-100.000.006',
  paymentTermDays: 30,
};

describe('Client use cases', () => {
  it('register creates a client in prospect status with audit', async () => {
    const result = await register.execute(valid);
    expect(result.ok).toBe(true);
    expect(audit.entries[0]?.kind).toBe('ClientRegistered');
    const get = await getCase.execute({ agencyId: AGENCY, clientId: 'client-1' });
    expect(get.ok).toBe(true);
    if (get.ok) expect(get.value.status).toBe('prospect');
  });

  it('register without IDE works (IDE optionnel)', async () => {
    const result = await register.execute({
      agencyId: AGENCY,
      legalName: 'Beta Sàrl',
      paymentTermDays: 45,
    });
    expect(result.ok).toBe(true);
  });

  it('register duplicate IDE within agency returns 409', async () => {
    await register.execute(valid);
    const result = await register.execute(valid);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(DuplicateClientIde);
  });

  it('same IDE in agency B is allowed (tenant isolation)', async () => {
    await register.execute(valid);
    const second = await register.execute({ ...valid, agencyId: asAgencyId('agency-b') });
    expect(second.ok).toBe(true);
    expect(repo.count()).toBe(2);
  });

  it('update transitions status prospect → active and writes audit', async () => {
    await register.execute(valid);
    const result = await update.execute({
      agencyId: AGENCY,
      clientId: 'client-1',
      status: 'active',
    });
    expect(result.ok).toBe(true);
    const kinds = audit.entries.map((e) => e.kind);
    expect(kinds).toContain('ClientStatusChanged');
    expect(kinds).toContain('ClientUpdated');
  });

  it('update returns client_not_found cross-tenant', async () => {
    await register.execute(valid);
    const result = await update.execute({
      agencyId: asAgencyId('agency-b'),
      clientId: 'client-1',
      legalName: 'X',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ClientNotFound);
  });

  it('update can change paymentTerms and creditLimit', async () => {
    await register.execute(valid);
    const result = await update.execute({
      agencyId: AGENCY,
      clientId: 'client-1',
      paymentTermDays: 60,
      creditLimitRappen: 100_000_00n,
    });
    expect(result.ok).toBe(true);
    const get = await getCase.execute({ agencyId: AGENCY, clientId: 'client-1' });
    if (get.ok) {
      const snap = get.value.toSnapshot();
      expect(snap.paymentTermDays).toBe(60);
      expect(snap.creditLimit?.toCents()).toBe(100_000_00n);
    }
  });

  it('archive soft-deletes; GET returns 404 default, list excludes', async () => {
    await register.execute(valid);
    await archive.execute({ agencyId: AGENCY, clientId: 'client-1' });
    const get = await getCase.execute({ agencyId: AGENCY, clientId: 'client-1' });
    expect(get.ok).toBe(false);
    const page = await list.execute({ agencyId: AGENCY });
    expect(page.items).toHaveLength(0);
    const withArchived = await list.execute({ agencyId: AGENCY, includeArchived: true });
    expect(withArchived.items).toHaveLength(1);
  });

  it('list filters by status', async () => {
    await register.execute(valid);
    await register.execute({ ...valid, ide: 'CHE-200.000.001', legalName: 'Beta' });
    await update.execute({ agencyId: AGENCY, clientId: 'client-1', status: 'active' });
    const active = await list.execute({ agencyId: AGENCY, status: 'active' });
    expect(active.items).toHaveLength(1);
    const prospects = await list.execute({ agencyId: AGENCY, status: 'prospect' });
    expect(prospects.items).toHaveLength(1);
  });

  it('list isolation: tenant A only sees its clients', async () => {
    await register.execute(valid);
    await register.execute({ ...valid, agencyId: asAgencyId('agency-b') });
    const pageA = await list.execute({ agencyId: AGENCY });
    expect(pageA.items).toHaveLength(1);
    const pageB = await list.execute({ agencyId: asAgencyId('agency-b') });
    expect(pageB.items).toHaveLength(1);
  });
});
