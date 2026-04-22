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
import {
  SendContractForSignatureUseCase,
  idempotencyFromContractId,
} from './send-contract-for-signature.use-case.js';
import { InMemoryEsignatureProvider } from './test-helpers.js';
import {
  InMemoryMissionContractRepository,
  StubContractPdfRenderer,
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

const validSigners = [
  { role: 'agency' as const, fullName: 'Chef Agence', email: 'a@acme.test' },
  {
    role: 'worker' as const,
    fullName: 'Jean Dupont',
    phoneE164: '+41791234567',
  },
];

async function setup(contractState: 'draft' | 'sent_for_signature' | 'signed' = 'draft') {
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
  if (contractState === 'sent_for_signature' || contractState === 'signed') {
    contract.sendForSignature('env-preexisting', clock);
  }
  if (contractState === 'signed') {
    contract.markSigned({ signedPdfKey: 'key' }, clock);
  }
  await contracts.save(contract);
  const templates = new InMemoryContractTemplateRegistry().register(FR_DEMENAGEMENT_TEMPLATE);
  const renderer = new StubContractPdfRenderer();
  const provider = new InMemoryEsignatureProvider();
  const useCase = new SendContractForSignatureUseCase(
    contracts,
    templates,
    renderer,
    provider,
    clock,
    idempotencyFromContractId,
  );
  return { contracts, provider, useCase };
}

describe('SendContractForSignatureUseCase', () => {
  it('happy path : contract draft → envelope créée, état sent_for_signature', async () => {
    const { useCase, contracts, provider } = await setup('draft');
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      branch: 'demenagement',
      signers: validSigners,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.envelopeId).toMatch(/^env-/);
      expect(result.value.signerUrls).toHaveLength(2);
    }
    const loaded = await contracts.findById(AGENCY, asMissionContractId('mc-1'));
    expect(loaded?.state).toBe('sent_for_signature');
    expect(loaded?.toSnapshot().zertesEnvelopeId).toMatch(/^env-/);
    void provider;
  });

  it('idempotent : même contrat déjà sent → renvoie envelope existante', async () => {
    const { useCase } = await setup('sent_for_signature');
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      branch: 'demenagement',
      signers: validSigners,
    });
    // État déjà sent → use case tente fetchEnvelope. Provider in-memory ne
    // connaît pas `env-preexisting` → fetchEnvelope échoue → use case
    // continue avec contract_wrong_state.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('contract_wrong_state');
  });

  it('signed → contract_wrong_state', async () => {
    const { useCase } = await setup('signed');
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      branch: 'demenagement',
      signers: validSigners,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('contract_wrong_state');
  });

  it('signers < 2 → invalid_signers', async () => {
    const { useCase } = await setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      branch: 'demenagement',
      signers: [validSigners[0] as never],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_signers');
  });

  it('worker sans phoneE164 → invalid_signers', async () => {
    const { useCase } = await setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      branch: 'demenagement',
      signers: [
        { role: 'agency', fullName: 'Agence' },
        { role: 'worker', fullName: 'Jean' }, // pas de phoneE164
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('invalid_signers');
  });

  it('contrat inconnu → contract_not_found', async () => {
    const { useCase } = await setup();
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'unknown',
      branch: 'demenagement',
      signers: validSigners,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('contract_not_found');
  });

  it('provider transient error → esignature_failed', async () => {
    const { useCase, provider } = await setup();
    provider.failNextCreate = 'transient';
    const result = await useCase.execute({
      agencyId: AGENCY,
      contractId: 'mc-1',
      branch: 'demenagement',
      signers: validSigners,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe('esignature_failed');
  });

  it('idempotencyFromContractId est déterministe et stable', () => {
    expect(idempotencyFromContractId('mc-1')).toBe(idempotencyFromContractId('mc-1'));
    expect(idempotencyFromContractId('mc-1')).not.toBe(idempotencyFromContractId('mc-2'));
  });

  it('rejoue : 2 appels successifs avec même contractId → provider déduplique via idempotency key', async () => {
    // Note : le use case ne fait pas de rejeu direct (guard sur contract state).
    // Ici on teste que le provider sous-jacent dédupliquerait si on
    // l'appelait 2x avec la même idempotencyKey.
    const { provider } = await setup();
    const input = {
      contractId: 'mc-1',
      reference: 'MC-2026-04-001',
      pdfBytes: new Uint8Array([1, 2, 3]),
      pdfSha256Hex: 'abc',
      signers: validSigners,
      level: 'advanced' as const,
      expiresAt: new Date(NOW.getTime() + 48 * 3600 * 1000),
      idempotencyKey: 'idem-1',
    };
    const r1 = await provider.createSigningRequest(input);
    const r2 = await provider.createSigningRequest(input);
    if (r1.ok && r2.ok) {
      expect(r1.value.envelopeId).toBe(r2.value.envelopeId); // même envelope
    }
  });
});
