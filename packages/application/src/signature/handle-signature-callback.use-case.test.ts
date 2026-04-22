import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import {
  asAgencyId,
  asMissionContractId,
  asStaffId,
  MissionContract,
  type ContractLegalSnapshot,
} from '@interim/domain';
import { HandleSignatureCallbackUseCase } from './handle-signature-callback.use-case.js';
import { InMemoryEsignatureProvider } from './test-helpers.js';
import {
  InMemoryContractPdfStorage,
  InMemoryMissionContractRepository,
} from '../contracts/test-helpers.js';

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

interface SetupOpts {
  readonly contractState?: 'draft' | 'sent_for_signature' | 'signed';
  readonly envelopeId?: string;
  readonly seedEnvelope?: boolean;
}

async function setup(opts: SetupOpts = {}) {
  const state = opts.contractState ?? 'sent_for_signature';
  const envelopeId = opts.envelopeId ?? 'env-test-1';
  const contracts = new InMemoryMissionContractRepository();
  const provider = new InMemoryEsignatureProvider();
  const storage = new InMemoryContractPdfStorage();

  // Si on veut que le provider connaisse l'envelopeId, on doit créer
  // l'envelope via createSigningRequest pour qu'elle soit indexée.
  let realEnvelopeId = envelopeId;
  if (opts.seedEnvelope !== false) {
    const created = await provider.createSigningRequest({
      contractId: 'mc-1',
      reference: 'MC-2026-04-001',
      pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
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
    realEnvelopeId = created.value.envelopeId;
  }

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
  if (state === 'sent_for_signature' || state === 'signed') {
    contract.sendForSignature(realEnvelopeId, clock);
  }
  if (state === 'signed') {
    contract.markSigned({ signedPdfKey: 'preexisting-key' }, clock);
  }
  await contracts.save(contract);

  const useCase = new HandleSignatureCallbackUseCase(contracts, provider, storage, clock);
  return { contracts, provider, storage, useCase, envelopeId: realEnvelopeId };
}

describe('HandleSignatureCallbackUseCase', () => {
  it('signed → stocke PDF signé + markSigned', async () => {
    const { useCase, provider, contracts, storage, envelopeId } = await setup();
    provider.simulateSign(envelopeId, NOW);
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      envelopeId,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe('signed');
      if (result.value.status === 'signed') {
        expect(result.value.signedPdfKey).toMatch(/^mem:\/\//);
        expect(storage.stored.has(result.value.signedPdfKey)).toBe(true);
      }
    }
    const loaded = await contracts.findById(AGENCY, asMissionContractId('mc-1'));
    expect(loaded?.state).toBe('signed');
    expect(loaded?.toSnapshot().signedPdfKey).toMatch(/^mem:\/\//);
  });

  it('expired → cancel(signature_expired)', async () => {
    const { useCase, provider, contracts, envelopeId } = await setup();
    provider.simulateExpire(envelopeId);
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      envelopeId,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('expired');
    const loaded = await contracts.findById(AGENCY, asMissionContractId('mc-1'));
    expect(loaded?.state).toBe('cancelled');
    expect(loaded?.toSnapshot().cancelReason).toBe('signature_expired');
  });

  it('cancelled → cancel(signature_cancelled)', async () => {
    const { useCase, provider, contracts, envelopeId } = await setup();
    provider.simulateCancel(envelopeId);
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      envelopeId,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('cancelled');
    const loaded = await contracts.findById(AGENCY, asMissionContractId('mc-1'));
    expect(loaded?.state).toBe('cancelled');
    expect(loaded?.toSnapshot().cancelReason).toBe('signature_cancelled');
  });

  it('pending → still_pending sans changement état', async () => {
    const { useCase, contracts, envelopeId } = await setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      envelopeId,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('still_pending');
    const loaded = await contracts.findById(AGENCY, asMissionContractId('mc-1'));
    expect(loaded?.state).toBe('sent_for_signature');
  });

  it('contract déjà signed → already_signed (idempotent)', async () => {
    const { useCase, envelopeId } = await setup({ contractState: 'signed' });
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      envelopeId,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.status).toBe('already_signed');
  });

  it('envelopeId mismatch → envelope_mismatch', async () => {
    const { useCase } = await setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      envelopeId: 'env-wrong-9999',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('envelope_mismatch');
  });

  it('contrat introuvable → contract_not_found', async () => {
    const { useCase, envelopeId } = await setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'unknown-contract',
      envelopeId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('contract_not_found');
  });

  it('provider transient fetch error → provider_failed', async () => {
    const { useCase, provider, envelopeId } = await setup();
    provider.failNextFetch = 'transient';
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      envelopeId,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('provider_failed');
  });

  it('rejouer 2x signed → 2e appel = already_signed', async () => {
    const { useCase, provider, envelopeId } = await setup();
    provider.simulateSign(envelopeId, NOW);
    const r1 = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      envelopeId,
    });
    expect(r1.ok).toBe(true);
    const r2 = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      envelopeId,
    });
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.value.status).toBe('already_signed');
  });
});
