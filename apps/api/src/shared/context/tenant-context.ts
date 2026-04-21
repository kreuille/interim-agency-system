import { AsyncLocalStorage } from 'node:async_hooks';

export interface TenantContext {
  readonly agencyId: string;
  readonly actorId?: string;
  readonly actorRole?: string;
}

const storage = new AsyncLocalStorage<TenantContext>();

export function runWithTenant<T>(context: TenantContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentTenant(): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error('Tenant context missing — requête non authentifiée ou middleware absent.');
  }
  return ctx;
}

export function tryCurrentTenant(): TenantContext | undefined {
  return storage.getStore();
}
