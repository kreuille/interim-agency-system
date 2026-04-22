import type { AgencyId } from '@interim/domain';
import type {
  InsertSmsLogInput,
  OptOutRepository,
  SmsLogRecord,
  SmsLogRepository,
  SmsProvider,
  SmsSendInput,
  SmsSendResult,
  SmsSender,
  SmsStatus,
} from './sms-sender.js';

/**
 * Sender no-op pour CI/dev : retourne un providerMessageId synthétique,
 * ne contacte aucun SMS provider.
 */
export class NoopSmsSender implements SmsSender {
  readonly sent: SmsSendInput[] = [];

  send(input: SmsSendInput): Promise<SmsSendResult> {
    this.sent.push(input);
    return Promise.resolve({
      providerMessageId: `noop-${String(this.sent.length)}`,
      provider: 'noop',
    });
  }
}

/**
 * Sender qui throw — utile pour tester `provider_transient`.
 */
export class FailingSmsSender implements SmsSender {
  constructor(private readonly message = 'provider_down') {}
  send(): Promise<SmsSendResult> {
    return Promise.reject(new Error(this.message));
  }
}

export class InMemorySmsLogRepository implements SmsLogRepository {
  private readonly records = new Map<string, SmsLogRecord>();

  insert(input: InsertSmsLogInput): Promise<void> {
    this.records.set(input.id, {
      id: input.id,
      agencyId: input.agencyId,
      toMasked: input.toMasked,
      templateCode: input.templateCode,
      provider: input.provider,
      providerMessageId: input.providerMessageId,
      status: input.status,
      sentAt: input.sentAt,
      deliveredAt: undefined,
      failureReason: input.failureReason,
      createdAt: input.createdAt,
    });
    return Promise.resolve();
  }

  updateByProviderMessageId(input: {
    providerMessageId: string;
    provider: SmsProvider;
    status: SmsStatus;
    deliveredAt?: Date;
    failureReason?: string;
  }): Promise<void> {
    for (const [id, record] of this.records) {
      if (
        record.providerMessageId === input.providerMessageId &&
        record.provider === input.provider
      ) {
        this.records.set(id, {
          ...record,
          status: input.status,
          deliveredAt: input.deliveredAt ?? record.deliveredAt,
          failureReason: input.failureReason ?? record.failureReason,
        });
        return Promise.resolve();
      }
    }
    return Promise.resolve();
  }

  findRecent(agencyId: AgencyId, limit: number): Promise<readonly SmsLogRecord[]> {
    return Promise.resolve(
      [...this.records.values()]
        .filter((r) => r.agencyId === agencyId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit),
    );
  }

  snapshot(): readonly SmsLogRecord[] {
    return [...this.records.values()];
  }
}

export class InMemoryOptOutRepository implements OptOutRepository {
  private readonly entries = new Set<string>();

  isOptedOut(agencyId: AgencyId, phoneE164: string): Promise<boolean> {
    return Promise.resolve(this.entries.has(this.key(agencyId, phoneE164)));
  }

  optOut(agencyId: AgencyId, phoneE164: string, _at: Date): Promise<void> {
    this.entries.add(this.key(agencyId, phoneE164));
    return Promise.resolve();
  }

  size(): number {
    return this.entries.size;
  }

  private key(agencyId: AgencyId, phoneE164: string): string {
    return `${agencyId}::${phoneE164}`;
  }
}
