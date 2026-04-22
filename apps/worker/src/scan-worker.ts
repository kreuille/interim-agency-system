import { Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import type { AntivirusScanner, ApplyScanResultUseCase, ScanRequest } from '@interim/application';

export const SCAN_QUEUE_NAME = 'document-scan';

export interface ScanWorkerDeps {
  readonly connection: Redis;
  readonly scanner: AntivirusScanner;
  readonly apply: ApplyScanResultUseCase;
  readonly fetchBody: (request: ScanRequest) => Promise<Buffer>;
  readonly concurrency?: number;
}

/**
 * Consumer BullMQ pour la queue `document-scan` :
 * - dépile une demande de scan
 * - re-télécharge le binaire depuis l'Object Storage via `fetchBody`
 * - lance le scan ClamAV
 * - applique le verdict via `ApplyScanResultUseCase`
 *
 * Idempotent : si le document est déjà sorti de PENDING_SCAN (rescan tardif),
 * `apply.execute` est un no-op.
 */
export function createScanWorker(deps: ScanWorkerDeps): Worker<ScanRequest> {
  return new Worker<ScanRequest>(
    SCAN_QUEUE_NAME,
    async (job: Job<ScanRequest>) => {
      const body = await deps.fetchBody(job.data);
      const verdict = await deps.scanner.scan(body);
      const result = await deps.apply.execute({
        agencyId: job.data.agencyId,
        documentId: job.data.documentId,
        verdict,
      });
      if (!result.ok) {
        throw new Error(`apply_scan_failed: ${result.error.message}`);
      }
      return { verdict };
    },
    {
      connection: deps.connection,
      concurrency: deps.concurrency ?? 4,
    },
  );
}
