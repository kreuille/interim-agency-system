import {
  asMissionContractId,
  type AgencyId,
  type ContractBranch,
  type ContractLang,
  type ContractTemplateRegistry,
  type MissionContractRepository,
} from '@interim/domain';
import type { Result } from '@interim/shared';
import type { ContractPdfRenderer, ContractPdfStorage } from './contract-pdf-ports.js';

/**
 * Génère le PDF du contrat draft (ou signed) puis le stocke.
 * Idempotent : appelable plusieurs fois (le hash SHA-256 sera identique
 * pour le même `MissionContractProps`, ce qui permet la déduplication
 * côté storage si désiré).
 *
 * Workflow typique :
 *   1. \`GenerateMissionContractUseCase\` crée le contrat (draft).
 *   2. \`RenderMissionContractPdfUseCase\` produit le PDF non signé,
 *      l'attache à \`signedPdfKey\` (stockage temporaire avant
 *      signature ZertES).
 *   3. \`SendForSignatureUseCase\` (A4.3) envoie à ZertES.
 *   4. À la signature, ZertES renvoie un PDF signé qu'on re-stocke
 *      en remplaçant la clé.
 */
export type RenderContractPdfErrorKind =
  | 'contract_not_found'
  | 'template_not_found'
  | 'invalid_branch';

export class RenderContractPdfError extends Error {
  constructor(
    public readonly kind: RenderContractPdfErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'RenderContractPdfError';
  }
}

export interface RenderMissionContractPdfInput {
  readonly agencyId: AgencyId;
  readonly contractId: string;
  readonly branch: ContractBranch;
  readonly lang?: ContractLang;
}

export interface RenderMissionContractPdfOutput {
  readonly storageKey: string;
  readonly sha256Hex: string;
  readonly bytesLength: number;
}

export class RenderMissionContractPdfUseCase {
  constructor(
    private readonly contracts: MissionContractRepository,
    private readonly templates: ContractTemplateRegistry,
    private readonly renderer: ContractPdfRenderer,
    private readonly storage: ContractPdfStorage,
  ) {}

  async execute(
    input: RenderMissionContractPdfInput,
  ): Promise<Result<RenderMissionContractPdfOutput, RenderContractPdfError>> {
    const contract = await this.contracts.findById(
      input.agencyId,
      asMissionContractId(input.contractId),
    );
    if (!contract) {
      return {
        ok: false,
        error: new RenderContractPdfError('contract_not_found', input.contractId),
      };
    }

    let template;
    try {
      template = this.templates.get(input.branch, input.lang);
    } catch (err) {
      return {
        ok: false,
        error: new RenderContractPdfError(
          'template_not_found',
          err instanceof Error ? err.message : 'unknown',
        ),
      };
    }

    const snap = contract.toSnapshot();
    const doc = template.build({
      reference: contract.reference,
      branch: input.branch,
      legal: snap.legal,
    });
    const rendered = await this.renderer.render(doc);
    const stored = await this.storage.store({
      agencyId: input.agencyId,
      contractId: contract.id,
      reference: contract.reference,
      bytes: rendered.bytes,
      sha256Hex: rendered.sha256Hex,
    });
    return {
      ok: true,
      value: {
        storageKey: stored.key,
        sha256Hex: rendered.sha256Hex,
        bytesLength: rendered.bytes.length,
      },
    };
  }
}
