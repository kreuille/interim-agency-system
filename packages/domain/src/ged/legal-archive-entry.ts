import { DomainError } from '../workers/errors.js';
import type { AgencyId } from '../shared/ids.js';

/**
 * Catégories légales d'archives. La rétention est imposée par la loi
 * suisse :
 *   - mission_contract  → 10 ans (LSE art. 19, conservation contrats)
 *   - payslip           →  5 ans (CO art. 958f, comptabilité)
 *   - invoice           → 10 ans (CO art. 958f, registres)
 *   - worker_legal_doc  →  durée d'emploi + 2 ans (permis, attestations
 *                          AVS/LAA, expirables. nLPD art. 6 → minimisation
 *                          après cessation)
 *   - timesheet         →  5 ans (preuves heures travaillées CCT/LTr)
 *
 * Voir `docs/compliance/registre-traitements.md §Tableau`.
 */
export const LEGAL_CATEGORIES = [
  'mission_contract',
  'payslip',
  'invoice',
  'worker_legal_doc',
  'timesheet',
] as const;
export type LegalCategory = (typeof LEGAL_CATEGORIES)[number];

/**
 * Politique de rétention par catégorie. Renvoie le nombre d'années
 * minimum durant lesquelles l'entrée doit rester immutable et non
 * supprimable. Pour `worker_legal_doc`, la durée est conditionnelle à
 * la fin d'emploi du worker (passée au use case via `employmentEndedAt`).
 *
 * Toute évolution réglementaire se fait ici (single source of truth).
 */
export const RETENTION_YEARS_BY_CATEGORY: Readonly<Record<LegalCategory, number>> = {
  mission_contract: 10,
  payslip: 5,
  invoice: 10,
  worker_legal_doc: 2, // + employmentEndedAt obligatoire
  timesheet: 5,
};

export interface ComputeRetentionInput {
  readonly category: LegalCategory;
  readonly archivedAt: Date;
  /**
   * Pour `worker_legal_doc` : date de fin d'emploi du worker.
   * Si non fournie pour cette catégorie, `computeRetentionUntil` rejette.
   * Pour les autres catégories, ignoré.
   */
  readonly employmentEndedAt?: Date;
}

export class LegalArchiveError extends DomainError {}

/**
 * Calcule la date `retention_until` à partir de la catégorie et de la
 * date d'archivage. Pour `worker_legal_doc`, exige `employmentEndedAt`
 * et calcule `employmentEndedAt + retentionYears`.
 *
 * Conforme nLPD art. 6 (durée nécessaire) ET CO 958f / LSE 19
 * (rétention minimum pour preuves légales).
 */
export function computeRetentionUntil(input: ComputeRetentionInput): Date {
  const years = RETENTION_YEARS_BY_CATEGORY[input.category];
  if (input.category === 'worker_legal_doc') {
    if (!input.employmentEndedAt) {
      throw new LegalArchiveError(
        'worker_legal_doc_requires_employment_end',
        'worker_legal_doc requiert employmentEndedAt pour calculer la rétention',
      );
    }
    return addYears(input.employmentEndedAt, years);
  }
  return addYears(input.archivedAt, years);
}

function addYears(d: Date, years: number): Date {
  const out = new Date(d.getTime());
  out.setUTCFullYear(out.getUTCFullYear() + years);
  return out;
}

/**
 * Métadonnées d'une entrée d'archive immutable (Write-Once-Read-Many).
 *
 * Une fois créée, **aucun champ ne peut être modifié** — même hash, même
 * `retention_until`, même `legal_category`. Les implémentations storage
 * (GCS object-lock, S3 Object Lock COMPLIANCE mode) appliquent ce
 * principe au niveau du blob lui-même.
 *
 * `referenceEntityType` + `referenceEntityId` font le pont vers l'entité
 * métier (ex. `mission_contract` → `MissionContract.id`).
 */
export interface LegalArchiveEntryProps {
  readonly id: string;
  readonly agencyId: AgencyId;
  readonly category: LegalCategory;
  readonly referenceEntityType: string;
  readonly referenceEntityId: string;
  readonly storageKey: string;
  readonly sha256Hex: string;
  readonly sizeBytes: number;
  readonly mimeType: string;
  readonly archivedAt: Date;
  readonly retentionUntil: Date;
  /** Pour worker_legal_doc — date de fin d'emploi qui a fixé la rétention. */
  readonly employmentEndedAt?: Date;
  /** Métadonnées libres (ex. `contractReference`, `payslipMonth`). */
  readonly metadata: Readonly<Record<string, string>>;
}

export class LegalArchiveEntry {
  private constructor(private readonly props: LegalArchiveEntryProps) {}

  static create(input: {
    readonly id: string;
    readonly agencyId: AgencyId;
    readonly category: LegalCategory;
    readonly referenceEntityType: string;
    readonly referenceEntityId: string;
    readonly storageKey: string;
    readonly sha256Hex: string;
    readonly sizeBytes: number;
    readonly mimeType: string;
    readonly archivedAt: Date;
    readonly employmentEndedAt?: Date;
    readonly metadata?: Readonly<Record<string, string>>;
  }): LegalArchiveEntry {
    if (input.sizeBytes <= 0) {
      throw new LegalArchiveError('invalid_size', 'sizeBytes doit être > 0');
    }
    if (!/^[0-9a-f]{64}$/i.test(input.sha256Hex)) {
      throw new LegalArchiveError(
        'invalid_sha256',
        `sha256Hex doit être 64 chars hex, reçu: ${input.sha256Hex}`,
      );
    }
    const retentionUntil = computeRetentionUntil({
      category: input.category,
      archivedAt: input.archivedAt,
      ...(input.employmentEndedAt ? { employmentEndedAt: input.employmentEndedAt } : {}),
    });
    return new LegalArchiveEntry({
      id: input.id,
      agencyId: input.agencyId,
      category: input.category,
      referenceEntityType: input.referenceEntityType,
      referenceEntityId: input.referenceEntityId,
      storageKey: input.storageKey,
      sha256Hex: input.sha256Hex,
      sizeBytes: input.sizeBytes,
      mimeType: input.mimeType,
      archivedAt: input.archivedAt,
      retentionUntil,
      ...(input.employmentEndedAt ? { employmentEndedAt: input.employmentEndedAt } : {}),
      metadata: input.metadata ?? {},
    });
  }

  /** Reconstitution depuis la persistance (Prisma) — pas de validation. */
  static fromPersistence(props: LegalArchiveEntryProps): LegalArchiveEntry {
    return new LegalArchiveEntry(props);
  }

  get id(): string {
    return this.props.id;
  }
  get agencyId(): AgencyId {
    return this.props.agencyId;
  }
  get category(): LegalCategory {
    return this.props.category;
  }
  get retentionUntil(): Date {
    return this.props.retentionUntil;
  }
  get storageKey(): string {
    return this.props.storageKey;
  }
  get sha256Hex(): string {
    return this.props.sha256Hex;
  }

  toSnapshot(): LegalArchiveEntryProps {
    return this.props;
  }

  /**
   * Vrai si l'entrée a dépassé sa rétention légale et peut être purgée.
   * Le système doit refuser toute suppression tant que cette méthode
   * renvoie false (cf. `PurgeExpiredArchivesUseCase`).
   */
  isPurgeable(now: Date): boolean {
    return now.getTime() >= this.props.retentionUntil.getTime();
  }
}
