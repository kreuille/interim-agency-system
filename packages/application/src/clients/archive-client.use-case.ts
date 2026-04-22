import { asClientId, ClientNotFound, type AgencyId, type ClientRepository } from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type { ClientAuditLogger } from './client-audit-logger.js';

export interface ArchiveClientInput {
  readonly agencyId: AgencyId;
  readonly clientId: string;
  readonly actorUserId?: string;
}

export class ArchiveClientUseCase {
  constructor(
    private readonly repo: ClientRepository,
    private readonly audit: ClientAuditLogger,
    private readonly clock: Clock,
  ) {}

  async execute(input: ArchiveClientInput): Promise<Result<void, ClientNotFound>> {
    const client = await this.repo.findById(input.agencyId, asClientId(input.clientId));
    if (!client) return { ok: false, error: new ClientNotFound(input.clientId) };

    const wasArchived = client.isArchived;
    client.archive(this.clock);
    await this.repo.save(client);

    if (!wasArchived) {
      await this.audit.record({
        kind: 'ClientArchived',
        agencyId: input.agencyId,
        clientId: input.clientId,
        ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
        diff: {},
        occurredAt: this.clock.now(),
      });
    }
    return { ok: true, value: undefined };
  }
}
