import { describe, expect, it } from 'vitest';
import { FixedClock } from '@interim/shared';
import {
  asAgencyId,
  asMissionContractId,
  asStaffId,
  MissionContract,
  type ContractLegalSnapshot,
} from '@interim/domain';
import { ResendSignatureUseCase } from './resend-signature.use-case.js';
import { InMemoryEsignatureProvider } from './test-helpers.js';
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

async function setup(opts: { state?: 'draft' | 'sent_for_signature' | 'signed' } = {}) {
  const state = opts.state ?? 'sent_for_signature';
  const contracts = new InMemoryMissionContractRepository();
  const provider = new InMemoryEsignatureProvider();

  const created = await provider.createSigningRequest({
    contractId: 'mc-1',
    reference: 'MC-2026-04-001',
    pdfBytes: new Uint8Array([1, 2, 3, 4]),
    pdfSha256Hex: 'deadbeef',
    signers: [
      { role: 'agency', fullName: 'Chef', email: 'a@acme.test' },
      { role: 'worker', fullName: 'Jean Dupont', phoneE164: '+41791234567' },
    ],
    level: 'advanced',
    expiresAt: new Date(NOW.getTime() + 48 * 3600 * 1000),
    idempotencyKey: 'mc-sig-mc-1',
  });
  if (!created.ok) throw new Error('seed');
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
    contract.markSigned({ signedPdfKey: 'k' }, clock);
  }
  await contracts.save(contract);
  return { useCase: new ResendSignatureUseCase(contracts, provider), envelopeId };
}

describe('ResendSignatureUseCase', () => {
  it('contract sent_for_signature → renvoie envelopeId + status', async () => {
    const { useCase, envelopeId } = await setup();
    const r = await useCase.execute({ agencyId: AGENCY, contractId: 'mc-1' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.envelopeId).toBe(envelopeId);
      expect(r.value.status).toBe('pending');
      expect(r.value.signerUrlsAvailable).toBe(false);
    }
  });

  it('contract signed → envelope_terminal', async () => {
    const { useCase } = await setup({ state: 'signed' });
    const r = await useCase.execute({ agencyId: AGENCY, contractId: 'mc-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('envelope_terminal');
  });

  it('contract draft (jamais envoyé) → no_envelope', async () => {
    const { useCase } = await setup({ state: 'draft' });
    const r = await useCase.execute({ agencyId: AGENCY, contractId: 'mc-1' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('no_envelope');
  });

  it('contract introuvable → contract_not_found', async () => {
    const { useCase } = await setup();
    const r = await useCase.execute({ agencyId: AGENCY, contractId: 'unknown' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe('contract_not_found');
  });
});
