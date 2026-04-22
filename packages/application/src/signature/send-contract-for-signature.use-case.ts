import {
  asMissionContractId,
  type AgencyId,
  type ContractBranch,
  type ContractLang,
  type ContractTemplateRegistry,
  type MissionContractRepository,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type { ContractPdfRenderer } from '../contracts/contract-pdf-ports.js';
import type { EsignatureProvider, SignatureLevel, SignerInput } from './esignature-provider.js';

/**
 * Use case orchestrant l'envoi d'un contrat en signature électronique.
 *
 * Ordre :
 *   1. Charge le contrat (état `draft` requis sinon refus).
 *   2. Charge le template par branche.
 *   3. Rend le PDF (deterministic via PdfLibContractRenderer).
 *   4. Appelle `EsignatureProvider.createSigningRequest` avec
 *      `idempotencyKey` (basée sur contractId).
 *   5. Marque le contrat `sent_for_signature` avec `zertesEnvelopeId`.
 *   6. Renvoie les `signerUrls` au caller (typiquement envoyés par SMS via
 *      `SendSmsUseCase` template `signature-invitation`).
 *
 * Idempotent : rejouer avec le même contrat (déjà sent_for_signature)
 * renvoie l'envelope existante via lookup `getEnvelope`. Évite de créer
 * 2 envelopes Swisscom pour le même contrat (coût + confusion).
 */

export type SendForSignatureErrorKind =
  | 'contract_not_found'
  | 'contract_wrong_state'
  | 'template_not_found'
  | 'esignature_failed'
  | 'invalid_signers';

export class SendForSignatureError extends Error {
  constructor(
    public readonly kind: SendForSignatureErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SendForSignatureError';
  }
}

export interface SendContractForSignatureInput {
  readonly agencyId: AgencyId;
  readonly contractId: string;
  readonly branch: ContractBranch;
  readonly lang?: ContractLang;
  readonly signers: readonly SignerInput[];
  readonly level?: SignatureLevel;
  /** Délai d'expiration en heures (default 48h). */
  readonly expiresInHours?: number;
}

export interface SendContractForSignatureOutput {
  readonly envelopeId: string;
  readonly signerUrls: readonly { readonly role: SignerInput['role']; readonly url: string }[];
  readonly expiresAt: Date;
}

const DEFAULT_EXPIRY_HOURS = 48;

export class SendContractForSignatureUseCase {
  constructor(
    private readonly contracts: MissionContractRepository,
    private readonly templates: ContractTemplateRegistry,
    private readonly renderer: ContractPdfRenderer,
    private readonly provider: EsignatureProvider,
    private readonly clock: Clock,
    private readonly idempotencyFactory: (contractId: string) => string = (id) => `signature-${id}`,
  ) {}

  async execute(
    input: SendContractForSignatureInput,
  ): Promise<Result<SendContractForSignatureOutput, SendForSignatureError>> {
    if (input.signers.length < 2) {
      return failure('invalid_signers', 'Au moins 2 signataires (agence + worker) requis');
    }
    const hasAgency = input.signers.some((s) => s.role === 'agency');
    const hasWorker = input.signers.some((s) => s.role === 'worker');
    if (!hasAgency || !hasWorker) {
      return failure('invalid_signers', 'Signataires requis : agency + worker minimum');
    }
    // OTP SMS requiert un téléphone côté worker
    const worker = input.signers.find((s) => s.role === 'worker');
    if (!worker?.phoneE164) {
      return failure('invalid_signers', 'Worker doit avoir phoneE164 pour OTP signature');
    }

    const contract = await this.contracts.findById(
      input.agencyId,
      asMissionContractId(input.contractId),
    );
    if (!contract) return failure('contract_not_found', `Contract ${input.contractId} introuvable`);

    if (contract.state === 'sent_for_signature') {
      // Idempotence : récupérer l'envelope existante.
      const existingEnvelopeId = contract.toSnapshot().zertesEnvelopeId;
      if (existingEnvelopeId) {
        const fetched = await this.provider.fetchEnvelope(existingEnvelopeId);
        if (fetched.ok) {
          // Reconstruit signerUrls vides (Swisscom ne re-renvoie pas les
          // URLs après création). Le caller peut requérir un resend
          // séparé si besoin (DETTE-047).
          return {
            ok: true,
            value: {
              envelopeId: existingEnvelopeId,
              signerUrls: [],
              expiresAt: contract.toSnapshot().sentForSignatureAt ?? this.clock.now(),
            },
          };
        }
      }
    }

    if (contract.state !== 'draft') {
      return failure('contract_wrong_state', `Contract en état ${contract.state} (draft requis)`);
    }

    let template;
    try {
      template = this.templates.get(input.branch, input.lang);
    } catch (err) {
      return failure(
        'template_not_found',
        err instanceof Error ? err.message : 'unknown_template_error',
      );
    }

    const snap = contract.toSnapshot();
    const doc = template.build({
      reference: contract.reference,
      branch: input.branch,
      legal: snap.legal,
    });
    const rendered = await this.renderer.render(doc);

    const expiresAt = new Date(
      this.clock.now().getTime() + (input.expiresInHours ?? DEFAULT_EXPIRY_HOURS) * 3600 * 1000,
    );
    const created = await this.provider.createSigningRequest({
      contractId: contract.id,
      reference: contract.reference,
      pdfBytes: rendered.bytes,
      pdfSha256Hex: rendered.sha256Hex,
      signers: input.signers,
      level: input.level ?? 'advanced',
      expiresAt,
      idempotencyKey: this.idempotencyFactory(contract.id),
    });
    if (!created.ok) {
      return failure('esignature_failed', `Esignature provider error: ${created.error.message}`);
    }

    contract.sendForSignature(created.value.envelopeId, this.clock);
    await this.contracts.save(contract);

    return {
      ok: true,
      value: {
        envelopeId: created.value.envelopeId,
        signerUrls: created.value.signerUrls,
        expiresAt: created.value.expiresAt,
      },
    };
  }
}

function failure(
  kind: SendForSignatureErrorKind,
  message: string,
): { readonly ok: false; readonly error: SendForSignatureError } {
  return { ok: false, error: new SendForSignatureError(kind, message) };
}

/**
 * Idempotency factory déterministe basée sur contractId. Deux appels
 * pour le même contractId → même clé → Swisscom déduplique côté serveur.
 */
export function idempotencyFromContractId(contractId: string): string {
  return `mc-sig-${contractId}`;
}
