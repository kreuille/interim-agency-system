import {
  asMissionContractId,
  type AgencyId,
  type MissionContractRepository,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type { ContractPdfStorage } from '../contracts/contract-pdf-ports.js';
import type { EsignatureProvider } from './esignature-provider.js';

/**
 * Use case appelé par le webhook `POST /webhooks/signature/swisscom`
 * après vérification HMAC. Récupère le PDF signé du provider, le stocke,
 * met à jour le contrat (`signed` ou `cancelled` selon l'état envelope).
 *
 * Idempotent : rejouer pour un contrat déjà `signed` est no-op.
 *
 * Note multi-tenant : l'agencyId est requis car Swisscom ne le fait pas
 * remonter dans le webhook ; le caller le résout via le mapping
 * envelopeId → contractId → agencyId (lookup repo).
 */
export type SignatureCallbackErrorKind =
  | 'contract_not_found'
  | 'envelope_mismatch'
  | 'provider_failed';

export class SignatureCallbackError extends Error {
  constructor(
    public readonly kind: SignatureCallbackErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SignatureCallbackError';
  }
}

export interface SignatureCallbackInput {
  readonly agencyId: AgencyId;
  readonly contractId: string;
  readonly envelopeId: string;
}

export type SignatureCallbackResult =
  | { readonly status: 'signed'; readonly signedPdfKey: string }
  | { readonly status: 'cancelled' }
  | { readonly status: 'expired' }
  | { readonly status: 'still_pending' }
  | { readonly status: 'already_signed' };

export class HandleSignatureCallbackUseCase {
  constructor(
    private readonly contracts: MissionContractRepository,
    private readonly provider: EsignatureProvider,
    private readonly storage: ContractPdfStorage,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: SignatureCallbackInput,
  ): Promise<Result<SignatureCallbackResult, SignatureCallbackError>> {
    const contract = await this.contracts.findById(
      input.agencyId,
      asMissionContractId(input.contractId),
    );
    if (!contract) return failure('contract_not_found', input.contractId);

    if (contract.state === 'signed') {
      return { ok: true, value: { status: 'already_signed' } };
    }

    const snapshot = contract.toSnapshot();
    if (snapshot.zertesEnvelopeId !== input.envelopeId) {
      return failure(
        'envelope_mismatch',
        `Contract ${contract.id} envelopeId=${snapshot.zertesEnvelopeId ?? 'none'} != ${input.envelopeId}`,
      );
    }

    const fetched = await this.provider.fetchEnvelope(input.envelopeId);
    if (!fetched.ok) {
      return failure(
        'provider_failed',
        `Provider fetch failed: ${fetched.error.kind} ${fetched.error.message}`,
      );
    }

    const env = fetched.value;
    if (env.status === 'pending' || env.status === 'partially_signed') {
      return { ok: true, value: { status: 'still_pending' } };
    }
    if (env.status === 'expired') {
      contract.cancel('signature_expired', this.clock);
      await this.contracts.save(contract);
      return { ok: true, value: { status: 'expired' } };
    }
    if (env.status === 'cancelled') {
      contract.cancel('signature_cancelled', this.clock);
      await this.contracts.save(contract);
      return { ok: true, value: { status: 'cancelled' } };
    }

    // status === 'signed'
    if (!env.signedPdfBytes || !env.signedPdfSha256Hex) {
      return failure('provider_failed', 'Envelope signed but signedPdfBytes missing');
    }
    const stored = await this.storage.store({
      agencyId: input.agencyId,
      contractId: contract.id,
      reference: contract.reference,
      bytes: env.signedPdfBytes,
      sha256Hex: env.signedPdfSha256Hex,
    });
    contract.markSigned({ signedPdfKey: stored.key }, this.clock);
    await this.contracts.save(contract);
    return { ok: true, value: { status: 'signed', signedPdfKey: stored.key } };
  }
}

function failure(
  kind: SignatureCallbackErrorKind,
  message: string,
): { readonly ok: false; readonly error: SignatureCallbackError } {
  return { ok: false, error: new SignatureCallbackError(kind, message) };
}
