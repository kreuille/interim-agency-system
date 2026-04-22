import type { MpAvailabilityPushBody, MpAvailabilityPushResponse } from '@interim/contracts';
import type { Result } from '@interim/shared';
import type { MpClient, MpError } from '../mp-client.js';

export class AvailabilityPushAdapter {
  constructor(
    private readonly client: MpClient,
    private readonly partnerId: string,
  ) {}

  push(
    staffId: string,
    body: MpAvailabilityPushBody,
    idempotencyKey?: string,
  ): Promise<Result<MpAvailabilityPushResponse, MpError>> {
    return this.client.request<MpAvailabilityPushResponse>({
      method: 'POST',
      path: `/api/v1/partners/${this.partnerId}/workers/${staffId}/availability`,
      body,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    });
  }
}
