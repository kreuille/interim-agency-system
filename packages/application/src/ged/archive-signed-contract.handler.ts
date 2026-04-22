import {
  asMissionContractId,
  type AgencyId,
  type MissionContractRepository,
} from '@interim/domain';
import type { Result } from '@interim/shared';
import type { EsignatureProvider } from '../signature/esignature-provider.js';
import type {
  ArchiveLegalDocumentUseCase,
  ArchiveLegalDocumentOutput,
} from './archive-legal-document.use-case.js';

/**
 * Handler à brancher après le `HandleSignatureCallbackUseCase` quand
 * le résultat est `signed`. Récupère le PDF signé du provider et
 * l'archive en GED catégorie `mission_contract` (rétention 10 ans LSE
 * art. 19).
 *
 * Découplé du callback principal pour respecter le SRP : le callback
 * met à jour l'état du contrat (saga court), le handler GED fait
 * l'archivage long terme. Permet aussi de rejouer l'archivage seul
 * sans reprocesser tout le webhook.
 *
 * Idempotent : `ArchiveLegalDocumentUseCase` détecte déjà le doublon
 * sur `(category, refType, refId)`.
 */

export type ArchiveSignedContractErrorKind =
  | 'contract_not_found'
  | 'contract_not_signed'
  | 'envelope_not_signed'
  | 'envelope_missing_bytes'
  | 'provider_failed'
  | 'archive_failed';

export class ArchiveSignedContractError extends Error {
  constructor(
    public readonly kind: ArchiveSignedContractErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'ArchiveSignedContractError';
  }
}

export interface ArchiveSignedContractInput {
  readonly agencyId: AgencyId;
  readonly contractId: string;
}

export class ArchiveSignedContractHandler {
  constructor(
    private readonly contracts: MissionContractRepository,
    private readonly provider: EsignatureProvider,
    private readonly archiveUseCase: ArchiveLegalDocumentUseCase,
  ) {}

  async execute(
    input: ArchiveSignedContractInput,
  ): Promise<Result<ArchiveLegalDocumentOutput, ArchiveSignedContractError>> {
    const contract = await this.contracts.findById(
      input.agencyId,
      asMissionContractId(input.contractId),
    );
    if (!contract) {
      return failure('contract_not_found', `Contract ${input.contractId} introuvable`);
    }
    if (contract.state !== 'signed') {
      return failure('contract_not_signed', `Contract en état ${contract.state} (signed requis)`);
    }
    const snap = contract.toSnapshot();
    if (!snap.zertesEnvelopeId) {
      return failure('envelope_not_signed', 'Contract signed sans zertesEnvelopeId');
    }

    const fetched = await this.provider.fetchEnvelope(snap.zertesEnvelopeId);
    if (!fetched.ok) {
      return failure('provider_failed', `Fetch envelope failed: ${fetched.error.message}`);
    }
    const env = fetched.value;
    if (env.status !== 'signed') {
      return failure('envelope_not_signed', `Envelope en état ${env.status} (signed requis)`);
    }
    if (!env.signedPdfBytes) {
      return failure('envelope_missing_bytes', 'Envelope signed sans signedPdfBytes');
    }

    const archive = await this.archiveUseCase.execute({
      agencyId: input.agencyId,
      category: 'mission_contract',
      referenceEntityType: 'MissionContract',
      referenceEntityId: contract.id,
      bytes: env.signedPdfBytes,
      mimeType: 'application/pdf',
      metadata: {
        reference: contract.reference,
        envelopeId: snap.zertesEnvelopeId,
      },
    });
    if (!archive.ok) {
      return failure('archive_failed', archive.error.message);
    }
    return { ok: true, value: archive.value };
  }
}

function failure(
  kind: ArchiveSignedContractErrorKind,
  message: string,
): { readonly ok: false; readonly error: ArchiveSignedContractError } {
  return { ok: false, error: new ArchiveSignedContractError(kind, message) };
}
