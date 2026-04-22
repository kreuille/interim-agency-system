import type {
  MpTimesheetSignBody,
  MpTimesheetSignResult,
  MpTimesheetsListResponse,
} from '@interim/contracts';
import type { Result } from '@interim/shared';
import type { MpClient, MpError } from '../mp-client.js';

export class TimesheetAdapter {
  constructor(
    private readonly client: MpClient,
    private readonly partnerId: string,
  ) {}

  list(): Promise<Result<MpTimesheetsListResponse, MpError>> {
    return this.client.request<MpTimesheetsListResponse>({
      method: 'GET',
      path: `/api/v1/partners/${this.partnerId}/timesheets`,
    });
  }

  sign(
    timesheetId: string,
    body: MpTimesheetSignBody,
    idempotencyKey?: string,
  ): Promise<Result<MpTimesheetSignResult, MpError>> {
    return this.client.request<MpTimesheetSignResult>({
      method: 'POST',
      path: `/api/v1/partners/${this.partnerId}/timesheets/${timesheetId}/sign`,
      body,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
    });
  }
}
