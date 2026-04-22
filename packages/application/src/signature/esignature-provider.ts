import type { Result } from '@interim/shared';

/**
 * Niveau de signature électronique selon ZertES (loi suisse) :
 *  - `simple`   : non probante (cocher case)
 *  - `advanced` : niveau minimal pour contrats LSE (cf.
 *                 `docs/01-brief.md §4.5`). Lien d'identification + OTP SMS.
 *  - `qualified`: certificat reconnu, identité vérifiée par RA-Stelle
 *                 (Swisscom Trust ou Quovadis). Coût ~5 CHF/signature.
 *
 * Default MVP : `advanced`. `qualified` est option pour les avenants
 * ou contrats > 6 mois (recommandation juriste agence).
 */
export const SIGNATURE_LEVELS = ['simple', 'advanced', 'qualified'] as const;
export type SignatureLevel = (typeof SIGNATURE_LEVELS)[number];

export const ENVELOPE_STATUSES = [
  'pending',
  'partially_signed',
  'signed',
  'expired',
  'cancelled',
] as const;
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number];

/**
 * Erreurs typées du provider :
 *  - `transient` : 5xx, network → retry possible
 *  - `permanent` : 4xx → ne pas retry
 *  - `expired`   : envelope dépassée
 *  - `not_found` : envelope inconnue
 */
export type EsignatureErrorKind = 'transient' | 'permanent' | 'expired' | 'not_found';

export class EsignatureError extends Error {
  constructor(
    public readonly kind: EsignatureErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'EsignatureError';
  }
}

export interface SignerInput {
  readonly role: 'agency' | 'client' | 'worker';
  readonly fullName: string;
  readonly email?: string;
  readonly phoneE164?: string; // requis pour OTP SMS
}

export interface CreateSigningRequestInput {
  readonly contractId: string;
  readonly reference: string;
  readonly pdfBytes: Uint8Array;
  readonly pdfSha256Hex: string;
  readonly signers: readonly SignerInput[];
  readonly level: SignatureLevel;
  readonly expiresAt: Date;
  /** Idempotency key — Swisscom déduplique côté serveur. */
  readonly idempotencyKey: string;
}

export interface CreatedEnvelope {
  readonly envelopeId: string;
  /** URL invitation par signataire (envoyée par SMS/email côté caller). */
  readonly signerUrls: readonly { readonly role: SignerInput['role']; readonly url: string }[];
  readonly expiresAt: Date;
}

export interface FetchedEnvelope {
  readonly envelopeId: string;
  readonly status: EnvelopeStatus;
  /** PDF final signé (présent uniquement si status=signed). */
  readonly signedPdfBytes?: Uint8Array;
  readonly signedPdfSha256Hex?: string;
  /** Bundle de preuves (PDF + JSON Swisscom) pour audit ZertES. */
  readonly proofBytes?: Uint8Array;
  readonly signedAt?: Date;
}

/**
 * Port outbound vers Swisscom Trust Signing Services (ou équivalent
 * Quovadis). Voir `apps/api/src/infrastructure/signature/swisscom.adapter.ts`
 * (DETTE-046 quand sandbox accessible).
 */
export interface EsignatureProvider {
  createSigningRequest(
    input: CreateSigningRequestInput,
  ): Promise<Result<CreatedEnvelope, EsignatureError>>;

  fetchEnvelope(envelopeId: string): Promise<Result<FetchedEnvelope, EsignatureError>>;

  cancel(envelopeId: string): Promise<Result<void, EsignatureError>>;
}
