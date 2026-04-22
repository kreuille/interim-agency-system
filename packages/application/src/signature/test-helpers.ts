import { createHash, randomUUID } from 'node:crypto';
import type { Result } from '@interim/shared';
import {
  EsignatureError,
  type CreateSigningRequestInput,
  type CreatedEnvelope,
  type EnvelopeStatus,
  type EsignatureProvider,
  type FetchedEnvelope,
} from './esignature-provider.js';

/**
 * Provider in-memory simulant Swisscom Sandbox.
 *
 * Méthodes de contrôle :
 *   - `simulateSign(envelopeId)` : marque signed + génère PDF signé
 *     (= bytes originaux concaténés avec un footer "SIGNED-{envelopeId}")
 *   - `simulateExpire(envelopeId)`
 *   - `simulateCancel(envelopeId)`
 */
export class InMemoryEsignatureProvider implements EsignatureProvider {
  private readonly envelopes = new Map<
    string,
    {
      readonly contractId: string;
      readonly idempotencyKey: string;
      readonly originalBytes: Uint8Array;
      readonly originalSha: string;
      readonly expiresAt: Date;
      status: EnvelopeStatus;
      signedBytes?: Uint8Array;
      signedSha?: string;
      signedAt?: Date;
    }
  >();
  private readonly byIdempotencyKey = new Map<string, string>();

  /** Provider behaviour control for tests. */
  failNextCreate?: 'transient' | 'permanent' | undefined;
  failNextFetch?: 'transient' | 'permanent' | undefined;

  createSigningRequest(
    input: CreateSigningRequestInput,
  ): Promise<Result<CreatedEnvelope, EsignatureError>> {
    if (this.failNextCreate) {
      const kind = this.failNextCreate;
      this.failNextCreate = undefined;
      return Promise.resolve({
        ok: false,
        error: new EsignatureError(kind, `simulated ${kind} on create`),
      });
    }
    // Idempotency : même clé → renvoie l'envelope existante.
    const existingId = this.byIdempotencyKey.get(input.idempotencyKey);
    if (existingId) {
      return Promise.resolve({
        ok: true,
        value: {
          envelopeId: existingId,
          signerUrls: input.signers.map((s) => ({
            role: s.role,
            url: `https://swisscom.test/sign/${existingId}/${s.role}`,
          })),
          expiresAt: input.expiresAt,
        },
      });
    }
    const envelopeId = `env-${randomUUID()}`;
    this.envelopes.set(envelopeId, {
      contractId: input.contractId,
      idempotencyKey: input.idempotencyKey,
      originalBytes: input.pdfBytes,
      originalSha: input.pdfSha256Hex,
      expiresAt: input.expiresAt,
      status: 'pending',
    });
    this.byIdempotencyKey.set(input.idempotencyKey, envelopeId);
    return Promise.resolve({
      ok: true,
      value: {
        envelopeId,
        signerUrls: input.signers.map((s) => ({
          role: s.role,
          url: `https://swisscom.test/sign/${envelopeId}/${s.role}`,
        })),
        expiresAt: input.expiresAt,
      },
    });
  }

  fetchEnvelope(envelopeId: string): Promise<Result<FetchedEnvelope, EsignatureError>> {
    if (this.failNextFetch) {
      const kind = this.failNextFetch;
      this.failNextFetch = undefined;
      return Promise.resolve({
        ok: false,
        error: new EsignatureError(kind, `simulated ${kind} on fetch`),
      });
    }
    const env = this.envelopes.get(envelopeId);
    if (!env) {
      return Promise.resolve({
        ok: false,
        error: new EsignatureError('not_found', `envelope ${envelopeId} unknown`),
      });
    }
    const result: FetchedEnvelope = {
      envelopeId,
      status: env.status,
      ...(env.signedBytes ? { signedPdfBytes: env.signedBytes } : {}),
      ...(env.signedSha ? { signedPdfSha256Hex: env.signedSha } : {}),
      ...(env.signedAt ? { signedAt: env.signedAt } : {}),
    };
    return Promise.resolve({ ok: true, value: result });
  }

  cancel(envelopeId: string): Promise<Result<void, EsignatureError>> {
    const env = this.envelopes.get(envelopeId);
    if (!env)
      return Promise.resolve({
        ok: false,
        error: new EsignatureError('not_found', envelopeId),
      });
    env.status = 'cancelled';
    return Promise.resolve({ ok: true, value: undefined });
  }

  /**
   * Simule la complétion d'une signature : marque signed + génère un
   * PDF "signé" (concat du PDF original + footer marker, hash recalculé).
   */
  simulateSign(envelopeId: string, at: Date): void {
    const env = this.envelopes.get(envelopeId);
    if (!env) throw new Error(`envelope ${envelopeId} unknown`);
    const footer = new TextEncoder().encode(`\n%% SIGNED-${envelopeId} %%\n`);
    const merged = new Uint8Array(env.originalBytes.length + footer.length);
    merged.set(env.originalBytes, 0);
    merged.set(footer, env.originalBytes.length);
    env.signedBytes = merged;
    env.signedSha = createHash('sha256').update(merged).digest('hex');
    env.signedAt = at;
    env.status = 'signed';
  }

  simulateExpire(envelopeId: string): void {
    const env = this.envelopes.get(envelopeId);
    if (env) env.status = 'expired';
  }

  simulateCancel(envelopeId: string): void {
    const env = this.envelopes.get(envelopeId);
    if (env) env.status = 'cancelled';
  }
}
