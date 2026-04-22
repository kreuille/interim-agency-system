import type { MpWorkerPushBody, MpWorkerPushResponse } from '@interim/contracts';
import type { Result } from '@interim/shared';
import type { MpClient, MpError } from '../mp-client.js';

export class WorkerPushAdapter {
  constructor(
    private readonly client: MpClient,
    private readonly partnerId: string,
  ) {}

  push(
    body: MpWorkerPushBody,
    idempotencyKey?: string,
  ): Promise<Result<MpWorkerPushResponse, MpError>> {
    return this.client.request<MpWorkerPushResponse>({
      method: 'POST',
      path: `/api/v1/partners/${this.partnerId}/workers`,
      body,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    });
  }
}
