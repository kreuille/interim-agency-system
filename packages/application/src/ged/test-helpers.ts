import { createHash } from 'node:crypto';
import type {
  AgencyId,
  LegalArchiveEntry,
  LegalArchiveRepository,
  LegalCategory,
} from '@interim/domain';
import {
  RetentionViolationError,
  type LegalArchiveAccessEntry,
  type LegalArchiveAccessLogger,
  type LegalArchiveStorage,
  type PutImmutableInput,
  type PutImmutableOutput,
} from './legal-archive-ports.js';

/**
 * Repository in-memory pour tests. Respecte le contrat multi-tenant
 * (toute query exige `agencyId`).
 */
export class InMemoryLegalArchiveRepository implements LegalArchiveRepository {
  private readonly byId = new Map<string, LegalArchiveEntry>();

  insert(entry: LegalArchiveEntry): Promise<void> {
    if (this.byId.has(entry.id)) {
      throw new Error(`LegalArchiveEntry ${entry.id} already exists (append-only)`);
    }
    this.byId.set(entry.id, entry);
    return Promise.resolve();
  }

  findById(agencyId: AgencyId, id: string): Promise<LegalArchiveEntry | undefined> {
    const e = this.byId.get(id);
    if (e?.agencyId !== agencyId) return Promise.resolve(undefined);
    return Promise.resolve(e);
  }

  findByReference(
    agencyId: AgencyId,
    refType: string,
    refId: string,
  ): Promise<readonly LegalArchiveEntry[]> {
    const out: LegalArchiveEntry[] = [];
    for (const e of this.byId.values()) {
      const s = e.toSnapshot();
      if (
        s.agencyId === agencyId &&
        s.referenceEntityType === refType &&
        s.referenceEntityId === refId
      ) {
        out.push(e);
      }
    }
    return Promise.resolve(out);
  }

  listPurgeable(
    now: Date,
    opts?: { readonly limit?: number },
  ): Promise<readonly LegalArchiveEntry[]> {
    const out: LegalArchiveEntry[] = [];
    for (const e of this.byId.values()) {
      if (e.isPurgeable(now)) {
        out.push(e);
        if (opts?.limit !== undefined && out.length >= opts.limit) break;
      }
    }
    return Promise.resolve(out);
  }

  purge(agencyId: AgencyId, id: string, now: Date): Promise<void> {
    const e = this.byId.get(id);
    if (e?.agencyId !== agencyId) return Promise.resolve();
    if (!e.isPurgeable(now)) {
      throw new Error(
        `Repository refuse purge de ${id}: retentionUntil ${e.retentionUntil.toISOString()} > now ${now.toISOString()}`,
      );
    }
    this.byId.delete(id);
    return Promise.resolve();
  }

  countByCategory(agencyId: AgencyId, category: LegalCategory): Promise<number> {
    let n = 0;
    for (const e of this.byId.values()) {
      const s = e.toSnapshot();
      if (s.agencyId === agencyId && s.category === category) n += 1;
    }
    return Promise.resolve(n);
  }

  size(): number {
    return this.byId.size;
  }
}

/**
 * Storage in-memory simulant un bucket avec Object Lock COMPLIANCE mode.
 * Toute tentative de suppression avant `retention_until` lève
 * `RetentionViolationError` — reproduisant le comportement GCS/S3.
 */
export class InMemoryLegalArchiveStorage implements LegalArchiveStorage {
  private readonly blobs = new Map<
    string,
    {
      readonly bytes: Uint8Array;
      readonly sha256Hex: string;
      readonly retentionUntil: Date;
      readonly mimeType: string;
    }
  >();

  /** Test hook : déclenche une erreur au prochain put. */
  failNextPut?: string | undefined;

  putImmutable(input: PutImmutableInput): Promise<PutImmutableOutput> {
    if (this.failNextPut) {
      const reason = this.failNextPut;
      this.failNextPut = undefined;
      return Promise.reject(new Error(`simulated put failure: ${reason}`));
    }
    const sha = createHash('sha256').update(input.bytes).digest('hex');
    const storageKey = `mem-ged://${input.agencyId}/${input.category}/${input.referenceEntityId}/${sha.slice(0, 8)}`;
    this.blobs.set(storageKey, {
      bytes: input.bytes,
      sha256Hex: sha,
      retentionUntil: input.retentionUntil,
      mimeType: input.mimeType,
    });
    return Promise.resolve({
      storageKey,
      sizeBytes: input.bytes.length,
      sha256Hex: sha,
    });
  }

  getSignedDownloadUrl(storageKey: string, ttlSeconds: number): Promise<string> {
    if (!this.blobs.has(storageKey)) {
      return Promise.reject(new Error(`blob ${storageKey} not found`));
    }
    return Promise.resolve(
      `https://ged.test/signed/${encodeURIComponent(storageKey)}?ttl=${String(ttlSeconds)}`,
    );
  }

  purge(storageKey: string, now: Date): Promise<void> {
    const b = this.blobs.get(storageKey);
    if (!b) return Promise.resolve();
    if (now.getTime() < b.retentionUntil.getTime()) {
      return Promise.reject(new RetentionViolationError(storageKey, b.retentionUntil));
    }
    this.blobs.delete(storageKey);
    return Promise.resolve();
  }

  size(): number {
    return this.blobs.size;
  }

  /** Accès interne pour assertions tests. */
  has(storageKey: string): boolean {
    return this.blobs.has(storageKey);
  }
}

/**
 * Access logger in-memory. Expose `entries` en readonly pour assertions.
 */
export class InMemoryLegalArchiveAccessLogger implements LegalArchiveAccessLogger {
  readonly entries: LegalArchiveAccessEntry[] = [];

  recordAccess(entry: LegalArchiveAccessEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}
