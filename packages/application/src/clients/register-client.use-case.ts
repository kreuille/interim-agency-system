import {
  asClientId,
  Client,
  DuplicateClientIde,
  type AgencyId,
  type ClientRepository,
} from '@interim/domain';
import { Ide, Money, Name, type Clock, type Result } from '@interim/shared';
import type { ClientAuditLogger } from './client-audit-logger.js';

export interface RegisterClientInput {
  readonly agencyId: AgencyId;
  readonly actorUserId?: string;
  readonly legalName: string;
  readonly ide?: string;
  readonly paymentTermDays?: number;
  readonly creditLimitRappen?: bigint;
  readonly notes?: string;
}

export interface RegisterClientOutput {
  readonly clientId: string;
}

export class RegisterClientUseCase {
  constructor(
    private readonly repo: ClientRepository,
    private readonly audit: ClientAuditLogger,
    private readonly clock: Clock,
    private readonly idFactory: () => string,
  ) {}

  async execute(
    input: RegisterClientInput,
  ): Promise<Result<RegisterClientOutput, DuplicateClientIde>> {
    let ide: Ide | undefined;
    if (input.ide !== undefined) {
      ide = Ide.parse(input.ide);
      const existing = await this.repo.findByIde(input.agencyId, ide.toString());
      if (existing) {
        return { ok: false, error: new DuplicateClientIde(ide.toString()) };
      }
    }

    const client = Client.create(
      {
        id: asClientId(this.idFactory()),
        agencyId: input.agencyId,
        legalName: Name.parse(input.legalName),
        ...(ide !== undefined ? { ide } : {}),
        ...(input.paymentTermDays !== undefined ? { paymentTermDays: input.paymentTermDays } : {}),
        ...(input.creditLimitRappen !== undefined
          ? { creditLimit: Money.fromRappen(input.creditLimitRappen) }
          : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
      this.clock,
    );
    await this.repo.save(client);

    await this.audit.record({
      kind: 'ClientRegistered',
      agencyId: input.agencyId,
      clientId: client.id,
      ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
      diff: {
        legalName: input.legalName,
        ide: ide?.toString() ?? null,
        status: 'prospect',
      },
      occurredAt: this.clock.now(),
    });

    return { ok: true, value: { clientId: client.id } };
  }
}
