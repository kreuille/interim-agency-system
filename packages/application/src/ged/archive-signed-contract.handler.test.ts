import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import {
  asAgencyId,
  asMissionContractId,
  asStaffId,
  MissionContract,
  type ContractLegalSnapshot,
} from '@interim/domain';
import { ArchiveSignedContractHandler } from './archive-signed-contract.handler.js';
import { ArchiveLegalDocumentUseCase } from './archive-legal-document.use-case.js';
import { InMemoryLegalArchiveRepository, InMemoryLegalArchiveStorage } from './test-helpers.js';
import { InMemoryEsignatureProvider } from '../signature/test-helpers.js';
import { InMemoryMissionContractRepository } from '../contracts/test-helpers.js';

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

async function setup(opts: { contractState?: 'draft' | 'sent_for_signature' | 'signed' } = {}) {
  const state = opts.contractState ?? 'signed';
  const contracts = new InMemoryMissionContractRepository();
  const provider = new InMemoryEsignatureProvider();
  const archiveRepo = new InMemoryLegalArchiveRepository();
  const archiveStorage = new InMemoryLegalArchiveStorage();
  const archiveUseCase = new ArchiveLegalDocumentUseCase(archiveRepo, archiveStorage, clock);

  // Crée enveloppe Swisscom + simule signature
  const created = await provider.createSigningRequest({
    contractId: 'mc-1',
    reference: 'MC-2026-04-001',
    pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
    pdfSha256Hex: 'deadbeef',
    signers: [
      { role: 'agency', fullName: 'Chef', email: 'a@acme.test' },
      { role: 'worker', fullName: 'Jean Dupont', phoneE164: '+41791234567' },
    ],
    level: 'advanced',
    expiresAt: new Date(NOW.getTime() + 48 * 3600 * 1000),
    idempotencyKey: 'mc-sig-mc-1',
  });
  if (!created.ok) throw new Error('seed failed');
  const envelopeId = created.value.envelopeId;

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
  if (state !== 'draft') {
    contract.sendForSignature(envelopeId, clock);
  }
  if (state === 'signed') {
    provider.simulateSign(envelopeId, NOW);
    contract.markSigned({ signedPdfKey: 'temp-key' }, clock);
  }
  await contracts.save(contract);

  const handler = new ArchiveSignedContractHandler(contracts, provider, archiveUseCase);
  return { handler, contracts, provider, archiveRepo, archiveStorage, envelopeId };
}

describe('ArchiveSignedContractHandler', () => {
  it('contrat signed → archive PDF avec rétention 10 ans', async () => {
    const { handler, archiveRepo, archiveStorage } = await setup();
    const result = await handler.execute({ agencyId: AGENCY, contractId: 'mc-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.alreadyExisted).toBe(false);
      expect(result.value.retentionUntil.toISOString()).toBe('2036-04-22T08:00:00.000Z');
      expect(result.value.storageKey).toMatch(/^mem-ged:\/\//);
    }
    expect(archiveRepo.size()).toBe(1);
    expect(archiveStorage.size()).toBe(1);
  });

  it('rejoue 2x → 2e appel = alreadyExisted (idempotent)', async () => {
    const { handler, archiveRepo } = await setup();
    const r1 = await handler.execute({ agencyId: AGENCY, contractId: 'mc-1' });
    const r2 = await handler.execute({ agencyId: AGENCY, contractId: 'mc-1' });
    expect(r1.ok && r2.ok).toBe(true);
    if (r1.ok && r2.ok) {
      expect(r2.value.alreadyExisted).toBe(true);
      expect(r2.value.entryId).toBe(r1.value.entryId);
    }
    expect(archiveRepo.size()).toBe(1);
  });

  it('contrat draft → contract_not_signed', async () => {
    const { handler } = await setup({ contractState: 'draft' });
    const r = await handler.execute({ agencyId: AGENCY, contractId: 'mc-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('contract_not_signed');
  });

  it('contract introuvable → contract_not_found', async () => {
    const { handler } = await setup();
    const r = await handler.execute({ agencyId: AGENCY, contractId: 'unknown' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('contract_not_found');
  });

  it('envelope encore pending côté provider → envelope_not_signed', async () => {
    // Setup en état 'signed' côté contrat mais on remet l'envelope en pending
    // côté provider (cas exotique de désync) — pour vérifier la garde.
    const { handler, provider, envelopeId } = await setup();
    // Force l'envelope back to pending (hack pour test)
    (
      provider as unknown as {
        envelopes: Map<string, { status: string; signedBytes?: Uint8Array }>;
      }
    ).envelopes.get(envelopeId)!.status = 'pending';
    const r = await handler.execute({ agencyId: AGENCY, contractId: 'mc-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('envelope_not_signed');
  });

  it('multi-tenant : autre agencyId → contract_not_found', async () => {
    const { handler } = await setup();
    const r = await handler.execute({
      agencyId: asAgencyId('agency-b'),
      contractId: 'mc-1',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('contract_not_found');
  });
});
