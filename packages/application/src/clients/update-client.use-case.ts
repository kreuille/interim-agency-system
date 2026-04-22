import {
  asClientId,
  ClientNotFound,
  type AgencyId,
  type ClientRepository,
  type ClientStatus,
} from '@interim/domain';
import { Ide, Money, Name, type Clock, type Result } from '@interim/shared';
import type { ClientAuditLogger } from './client-audit-logger.js';

export interface UpdateClientInput {
  readonly agencyId: AgencyId;
  readonly clientId: string;
  readonly actorUserId?: string;
  readonly legalName?: string;
  readonly ide?: string | null;
  readonly paymentTermDays?: number;
  readonly creditLimitRappen?: bigint | null;
  readonly status?: ClientStatus;
}

export class UpdateClientUseCase {
  constructor(
    private readonly repo: ClientRepository,
    private readonly audit: ClientAuditLogger,
    private readonly clock: Clock,
  ) {}

  async execute(input: UpdateClientInput): Promise<Result<void, ClientNotFound>> {
    const client = await this.repo.findById(input.agencyId, asClientId(input.clientId));
    if (!client) return { ok: false, error: new ClientNotFound(input.clientId) };

    const before = client.toSnapshot();

    if (input.legalName !== undefined) {
      client.rename(Name.parse(input.legalName), this.clock);
    }
    if (input.ide !== undefined) {
      client.changeIde(input.ide === null ? undefined : Ide.parse(input.ide), this.clock);
    }
    if (input.paymentTermDays !== undefined) {
      client.changePaymentTerms(input.paymentTermDays, this.clock);
    }
    if (input.creditLimitRappen !== undefined) {
      client.changeCreditLimit(
        input.creditLimitRappen === null ? undefined : Money.fromRappen(input.creditLimitRappen),
        this.clock,
      );
    }
    if (input.status !== undefined) {
      client.transitionTo(input.status, this.clock);
      await this.audit.record({
        kind: 'ClientStatusChanged',
        agencyId: input.agencyId,
        clientId: input.clientId,
        ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
        diff: { from: before.status, to: input.status },
        occurredAt: this.clock.now(),
      });
    }

    await this.repo.save(client);

    const after = client.toSnapshot();
    await this.audit.record({
      kind: 'ClientUpdated',
      agencyId: input.agencyId,
      clientId: input.clientId,
      ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      diff: {
        before: { legalName: before.legalName.toString(), status: before.status },
        after: { legalName: after.legalName.toString(), status: after.status },
      },
      occurredAt: this.clock.now(),
    });
    return { ok: true, value: undefined };
  }
}
