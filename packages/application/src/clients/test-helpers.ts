import {
  type AgencyId,
  type Client,
  type ClientId,
  type ClientListPage,
  type ClientRepository,
  type ListClientsQuery,
} from '@interim/domain';
import type { ClientAuditEntry, ClientAuditLogger } from './client-audit-logger.js';

export class InMemoryClientRepository implements ClientRepository {
  private readonly store = new Map<string, Client>();

  private key(agencyId: AgencyId, id: ClientId): string {
    return `${agencyId}::${id}`;
  }

  save(client: Client): Promise<void> {
    this.store.set(this.key(client.agencyId, client.id), client);
    return Promise.resolve();
  }

  findById(agencyId: AgencyId, id: ClientId): Promise<Client | null> {
    return Promise.resolve(this.store.get(this.key(agencyId, id)) ?? null);
  }

  findByIde(agencyId: AgencyId, ide: string): Promise<Client | null> {
    for (const c of this.store.values()) {
      if (c.agencyId === agencyId && c.toSnapshot().ide?.toString() === ide) {
        return Promise.resolve(c);
      }
    }
    return Promise.resolve(null);
  }

  list(query: ListClientsQuery): Promise<ClientListPage> {
    const items: Client[] = [];
    for (const c of this.store.values()) {
      if (c.agencyId !== query.agencyId) continue;
      if (!query.includeArchived && c.isArchived) continue;
      if (query.status && c.status !== query.status) continue;
      items.push(c);
    }
    return Promise.resolve({ items: items.slice(0, query.limit) });
  }

  count(): number {
    return this.store.size;
  }
}

export class InMemoryClientAuditLogger implements ClientAuditLogger {
  readonly entries: ClientAuditEntry[] = [];

  record(entry: ClientAuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}
