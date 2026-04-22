import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import type { ScanQueue, ScanRequest } from '@interim/application';

export const SCAN_QUEUE_NAME = 'document-scan';

/**
 * Producer BullMQ : enqueue les demandes de scan antivirus pour traitement
 * asynchrone par le worker (`apps/worker`).
 *
 * Backoff exponentiel sur erreur (3 retries), retention 7 jours pour les
 * jobs réussis (audit), 30 jours pour les jobs échoués (debug).
 */
export class BullMqScanQueue implements ScanQueue {
  private readonly queue: Queue<ScanRequest>;

  constructor(connection: Redis) {
    this.queue = new Queue<ScanRequest>(SCAN_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 7 * 24 * 3600, count: 1000 },
        removeOnFail: { age: 30 * 24 * 3600 },
      },
    });
  }

  async enqueue(request: ScanRequest): Promise<void> {
    await this.queue.add('scan', request, {
      jobId: `scan:${request.agencyId}:${request.documentId}`,
    });
  }

  async close(): Promise<void> {
    await this.queue.close();
  }
}
