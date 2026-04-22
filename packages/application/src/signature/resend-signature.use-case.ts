import {
  asMissionContractId,
  type AgencyId,
  type MissionContractRepository,
} from '@interim/domain';
import type { Result } from '@interim/shared';
import type { EsignatureProvider } from './esignature-provider.js';

/**
 * Use case : renvoie les signerUrls d'une enveloppe Swisscom existante
 * (closes DETTE-047).
 *
 * Le `SendContractForSignatureUseCase` ne re-renvoie pas les URLs après
 * la création initiale (Swisscom les retourne uniquement à `createSigningRequest`).
 * Si le worker perd le SMS d'invitation, on peut soit (a) demander à
 * Swisscom de re-générer une nouvelle enveloppe (cher, recommence les
 * compteurs OTP) — DETTE plus tard — soit (b) renvoyer les URLs
 * mémorisées en local. Cette implémentation MVP ne mémorise pas encore
 * les URLs (DETTE-061), donc elle se contente d'un fetch envelope pour
 * vérifier qu'elle existe et renvoie un 501 invitant à appeler MP
 * directement. Wire complet quand on aura la persistance des URLs.
 */

export type ResendSignatureErrorKind =
  | 'contract_not_found'
  | 'no_envelope'
  | 'envelope_terminal'
  | 'provider_failed';

export class ResendSignatureError extends Error {
  constructor(
    public readonly kind: ResendSignatureErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ResendSignatureError';
  }
}

export interface ResendSignatureInput {
  readonly agencyId: AgencyId;
  readonly contractId: string;
}

export interface ResendSignatureOutput {
  readonly envelopeId: string;
  readonly status: string;
  readonly expiresAt: Date | undefined;
  /** signerUrls non disponibles en MVP, voir DETTE-061. */
  readonly signerUrlsAvailable: false;
}

export class ResendSignatureUseCase {
  constructor(
    private readonly contracts: MissionContractRepository,
    private readonly provider: EsignatureProvider,
  ) {}

  async execute(
    input: ResendSignatureInput,
  ): Promise<Result<ResendSignatureOutput, ResendSignatureError>> {
    const contract = await this.contracts.findById(
      input.agencyId,
      asMissionContractId(input.contractId),
    );
    if (!contract) return failure('contract_not_found', input.contractId);
    const snap = contract.toSnapshot();
    if (!snap.zertesEnvelopeId) {
      return failure('no_envelope', `Contract ${input.contractId} sans envelopeId`);
    }
    if (contract.state === 'signed' || contract.state === 'cancelled') {
      return failure('envelope_terminal', `Contract en état ${contract.state}`);
    }
    const fetched = await this.provider.fetchEnvelope(snap.zertesEnvelopeId);
    if (!fetched.ok) {
      return failure('provider_failed', fetched.error.message);
    }
    return {
      ok: true,
      value: {
        envelopeId: snap.zertesEnvelopeId,
        status: fetched.value.status,
        expiresAt: snap.sentForSignatureAt,
        signerUrlsAvailable: false,
      },
    };
  }
}

function failure(
  kind: ResendSignatureErrorKind,
  message: string,
): { readonly ok: false; readonly error: ResendSignatureError } {
  return { ok: false, error: new ResendSignatureError(kind, message) };
}
