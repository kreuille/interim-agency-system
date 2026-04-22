import type { AgencyId } from '../shared/ids.js';
import type { Client, ClientId } from './client.js';

export interface ListClientsQuery {
  readonly agencyId: AgencyId;
  readonly includeArchived?: boolean;
  readonly status?: 'prospect' | 'active' | 'suspended' | 'churned';
  readonly search?: string;
  readonly limit: number;
  readonly cursor?: string;
}

export interface ClientListPage {
  readonly items: readonly Client[];
  readonly nextCursor?: string;
}

export interface ClientRepository {
  save(client: Client): Promise<void>;
  findById(agencyId: AgencyId, id: ClientId): Promise<Client | null>;
  findByIde(agencyId: AgencyId, ide: string): Promise<Client | null>;
  list(query: ListClientsQuery): Promise<ClientListPage>;
}
