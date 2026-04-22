import type { MpAssignmentResponseBody, MpAssignmentResponseResult } from '@interim/contracts';
import type { Result } from '@interim/shared';
import type { MpClient, MpError } from '../mp-client.js';

export class AssignmentResponseAdapter {
  constructor(
    private readonly client: MpClient,
    private readonly partnerId: string,
  ) {}

  respond(
    requestId: string,
    body: MpAssignmentResponseBody,
    idempotencyKey?: string,
  ): Promise<Result<MpAssignmentResponseResult, MpError>> {
    return this.client.request<MpAssignmentResponseResult>({
      method: 'POST',
      path: `/api/v1/partners/${this.partnerId}/assignments/${requestId}/response`,
      body,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    });
  }
}
