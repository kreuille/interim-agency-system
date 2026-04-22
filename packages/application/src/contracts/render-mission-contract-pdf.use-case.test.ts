import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import {
  asAgencyId,
  asMissionContractId,
  asStaffId,
  FR_DEMENAGEMENT_TEMPLATE,
  InMemoryContractTemplateRegistry,
  MissionContract,
  type ContractLegalSnapshot,
} from '@interim/domain';
import { RenderMissionContractPdfUseCase } from './render-mission-contract-pdf.use-case.js';
import {
  InMemoryContractPdfStorage,
  InMemoryMissionContractRepository,
  StubContractPdfRenderer,
} from './test-helpers.js';

const NOW = new Date('2026-04-22T08:00:00Z');
const clock = new FixedClock(NOW);
const AGENCY = asAgencyId('agency-a');
const WORKER = asStaffId('worker-1');

function legal(): ContractLegalSnapshot {
  return {
    agencyName: 'Acme',
    agencyIde: 'CHE-100.000.001',
    agencyLseAuthorization: 'GE-LSE-2024-001',
    agencyLseExpiresAt: new Date('2027-04-22T00:00:00Z'),
    clientName: 'Client SA',
    clientIde: 'CHE-200.000.001',
    workerFirstName: 'Jean',
    workerLastName: 'Dupont',
    workerAvs: '756.1234.5678.97',
    missionTitle: 'Cariste',
    siteAddress: 'Rue 1',
    canton: 'GE',
    cctReference: 'CCT Construction',
    hourlyRateRappen: 3200,
    startsAt: new Date('2026-04-25T07:00:00Z'),
    endsAt: new Date('2026-04-25T16:00:00Z'),
    weeklyHours: 9,
  };
}

async function setup() {
  const contracts = new InMemoryMissionContractRepository();
  const contract = MissionContract.create({
    id: asMissionContractId('mc-1'),
    agencyId: AGENCY,
    workerId: WORKER,
    proposalId: 'mp-1',
    reference: 'MC-2026-04-001',
    branch: 'demenagement',
    legal: legal(),
    clock,
  });
  await contracts.save(contract);
  const templates = new InMemoryContractTemplateRegistry().register(FR_DEMENAGEMENT_TEMPLATE);
  const renderer = new StubContractPdfRenderer();
  const storage = new InMemoryContractPdfStorage();
  const useCase = new RenderMissionContractPdfUseCase(contracts, templates, renderer, storage);
  return { useCase, storage };
}

describe('RenderMissionContractPdfUseCase', () => {
  it('happy path → PDF rendu + stocké + hash renvoyé', async () => {
    const { useCase, storage } = await setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      branch: 'demenagement',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.sha256Hex).toMatch(/^[0-9a-f]{64}$/);
      expect(result.value.storageKey).toContain('mc-1');
      expect(result.value.bytesLength).toBeGreaterThan(0);
      expect(storage.stored.has(result.value.storageKey)).toBe(true);
    }
  });

  it('contrat inconnu → contract_not_found', async () => {
    const { useCase } = await setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'unknown',
      branch: 'demenagement',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('contract_not_found');
  });

  it('branche sans template → template_not_found', async () => {
    const contracts = new InMemoryMissionContractRepository();
    await contracts.save(
      MissionContract.create({
        id: asMissionContractId('mc-2'),
        agencyId: AGENCY,
        workerId: WORKER,
        proposalId: 'mp-2',
        reference: 'MC-2',
        branch: 'btp_gros_oeuvre',
        legal: legal(),
        clock,
      }),
    );
    const templates = new InMemoryContractTemplateRegistry(); // vide
    const renderer = new StubContractPdfRenderer();
    const storage = new InMemoryContractPdfStorage();
    const useCase = new RenderMissionContractPdfUseCase(contracts, templates, renderer, storage);
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-2',
      branch: 'btp_gros_oeuvre',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('template_not_found');
  });

  it('idempotent : 2 renders du même contrat → même hash', async () => {
    const { useCase } = await setup();
    const r1 = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      branch: 'demenagement',
    });
    const r2 = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      branch: 'demenagement',
    });
    if (r1.ok && r2.ok) expect(r1.value.sha256Hex).toBe(r2.value.sha256Hex);
  });
});
