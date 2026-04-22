import type { LegalArchiveRepository } from '@interim/domain';
import type { Clock } from '@interim/shared';
import type { LegalArchiveStorage } from './legal-archive-ports.js';
import { RetentionViolationError } from './legal-archive-ports.js';

/**
 * Job mensuel de purge des archives dont la rétention est dépassée.
 *
 * Double vérification (defense in depth) :
 *   1. Domain `LegalArchiveEntry.isPurgeable(now)` avant toute action.
 *   2. Storage `LegalArchiveStorage.purge()` revérifie et refuse si
 *      object-lock encore actif (RetentionViolationError propagée).
 *
 * Ordre opérationnel : storage purge → repo purge. Si storage échoue,
 * l'entrée repo reste (retry au prochain run). Si repo échoue après
 * storage, on log : l'entrée repo pointe vers un blob absent (orphan)
 * et sera filtrée au prochain run par `listPurgeable` (return empty).
 *
 * Renvoie un compte-rendu pour monitoring (Prometheus counter + Sentry
 * si erreurs).
 */

export interface PurgeExpiredArchivesInput {
  /** Nombre max d'entrées à traiter par run. Default: 100. */
  readonly limit?: number;
  /** Dry-run : calcule mais ne supprime rien. Default: false. */
  readonly dryRun?: boolean;
}

export interface PurgeExpiredArchivesOutput {
  readonly scanned: number;
  readonly purged: number;
  readonly retentionViolations: number;
  readonly errors: readonly PurgeError[];
}

export interface PurgeError {
  readonly archiveEntryId: string;
  readonly storageKey: string;
  readonly reason: string;
}

const DEFAULT_LIMIT = 100;

export class PurgeExpiredArchivesUseCase {
  constructor(
    private readonly repo: LegalArchiveRepository,
    private readonly storage: LegalArchiveStorage,
    private readonly clock: Clock,
  ) {}

  async execute(input: PurgeExpiredArchivesInput = {}): Promise<PurgeExpiredArchivesOutput> {
    const now = this.clock.now();
    const limit = input.limit ?? DEFAULT_LIMIT;
    const candidates = await this.repo.listPurgeable(now, { limit });

    let purged = 0;
    let retentionViolations = 0;
    const errors: PurgeError[] = [];

    for (const entry of candidates) {
      const snap = entry.toSnapshot();
      // Defense in depth : revérifie côté domain même si repo dit "purgeable".
      if (!entry.isPurgeable(now)) {
        retentionViolations += 1;
        errors.push({
          archiveEntryId: snap.id,
          storageKey: snap.storageKey,
          reason: `domain isPurgeable(now)=false (retentionUntil=${snap.retentionUntil.toISOString()})`,
        });
        continue;
      }

      if (input.dryRun) {
        purged += 1;
        continue;
      }

      try {
        await this.storage.purge(snap.storageKey, now);
      } catch (err) {
        if (err instanceof RetentionViolationError) {
          retentionViolations += 1;
          errors.push({
            archiveEntryId: snap.id,
            storageKey: snap.storageKey,
            reason: `storage refused purge: ${err.message}`,
          });
          continue;
        }
        errors.push({
          archiveEntryId: snap.id,
          storageKey: snap.storageKey,
          reason: `storage error: ${err instanceof Error ? err.message : 'unknown'}`,
        });
        continue;
      }

      try {
        await this.repo.purge(snap.agencyId, snap.id, now);
        purged += 1;
      } catch (err) {
        errors.push({
          archiveEntryId: snap.id,
          storageKey: snap.storageKey,
          reason: `repo purge error: ${err instanceof Error ? err.message : 'unknown'}`,
        });
      }
    }

    return {
      scanned: candidates.length,
      purged,
      retentionViolations,
      errors,
    };
  }
}
