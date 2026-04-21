import { describe, it, expect } from 'vitest';
import { currentTenant, runWithTenant, tryCurrentTenant } from './tenant-context.js';

describe('TenantContext', () => {
  it('currentTenant throws when no context is active', () => {
    expect(() => currentTenant()).toThrow(/Tenant context missing/);
  });

  it('runWithTenant exposes the context to callers', () => {
    const result = runWithTenant({ agencyId: 'agency-a' }, () => currentTenant());
    expect(result.agencyId).toBe('agency-a');
  });

  it('isolates two concurrent tenant contexts', async () => {
    const [a, b] = await Promise.all([
      Promise.resolve().then(() =>
        runWithTenant({ agencyId: 'agency-a' }, () => currentTenant().agencyId),
      ),
      Promise.resolve().then(() =>
        runWithTenant({ agencyId: 'agency-b' }, () => currentTenant().agencyId),
      ),
    ]);
    expect(a).toBe('agency-a');
    expect(b).toBe('agency-b');
  });

  it('tryCurrentTenant returns undefined outside context', () => {
    expect(tryCurrentTenant()).toBeUndefined();
  });
});
