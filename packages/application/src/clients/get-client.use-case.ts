import {
  asClientId,
  ClientNotFound,
  type AgencyId,
  type Client,
  type ClientRepository,
} from '@interim/domain';
import type { Result } from '@interim/shared';

export interface GetClientInput {
  readonly agencyId: AgencyId;
  readonly clientId: string;
  readonly includeArchived?: boolean;
}

export class GetClientUseCase {
  constructor(private readonly repo: ClientRepository) {}

  async execute(input: GetClientInput): Promise<Result<Client, ClientNotFound>> {
    const client = await this.repo.findById(input.agencyId, asClientId(input.clientId));
    if (!client || (client.isArchived && !input.includeArchived)) {
      return { ok: false, error: new ClientNotFound(input.clientId) };
    }
    return { ok: true, value: client };
  }
}
