import { describe, it, expect } from 'vitest';
import { CrossTenantLeak, assertTenantConsistent } from './tenant-guard.js';

const TENANT = 'agency-a';

describe('assertTenantConsistent', () => {
  it('passes when where.agencyId matches context', () => {
    expect(() => {
      assertTenantConsistent({
        model: 'TempWorker',
        operation: 'findFirst',
        args: { where: { agencyId: TENANT, id: 'worker-1' } },
        contextAgencyId: TENANT,
      });
    }).not.toThrow();
  });

  it('throws CrossTenantLeak when where.agencyId mismatches', () => {
    expect(() => {
      assertTenantConsistent({
        model: 'TempWorker',
        operation: 'findMany',
        args: { where: { agencyId: 'agency-b' } },
        contextAgencyId: TENANT,
      });
    }).toThrow(CrossTenantLeak);
  });

  it('throws when data.agencyId mismatches on create', () => {
    expect(() => {
      assertTenantConsistent({
        model: 'TempWorker',
        operation: 'create',
        args: { data: { agencyId: 'agency-b', firstName: 'X' } },
        contextAgencyId: TENANT,
      });
    }).toThrow(CrossTenantLeak);
  });

  it('throws when data.agencyId mismatches on upsert', () => {
    expect(() => {
      assertTenantConsistent({
        model: 'TempWorker',
        operation: 'upsert',
        args: {
          where: { id: 'worker-1' },
          data: { agencyId: 'agency-b' },
        },
        contextAgencyId: TENANT,
      });
    }).toThrow(CrossTenantLeak);
  });

  it('is a no-op for non-tenant models (Agency, idempotency keys)', () => {
    expect(() => {
      assertTenantConsistent({
        model: 'Agency',
        operation: 'findFirst',
        args: { where: { id: 'any' } },
        contextAgencyId: TENANT,
      });
    }).not.toThrow();

    expect(() => {
      assertTenantConsistent({
        model: 'InboundIdempotencyKey',
        operation: 'findFirst',
        args: { where: { agencyId: 'agency-z', idempotencyKey: 'k' } },
        contextAgencyId: TENANT,
      });
    }).not.toThrow();
  });

  it('is a no-op for non-guarded operations (executeRaw, queryRaw)', () => {
    expect(() => {
      assertTenantConsistent({
        model: 'TempWorker',
        operation: 'executeRaw',
        args: { where: { agencyId: 'agency-b' } },
        contextAgencyId: TENANT,
      });
    }).not.toThrow();
  });

  it('is a no-op when agencyId is absent from where (caller lets Prisma do its thing)', () => {
    expect(() => {
      assertTenantConsistent({
        model: 'TempWorker',
        operation: 'findFirst',
        args: { where: { id: 'worker-1' } },
        contextAgencyId: TENANT,
      });
    }).not.toThrow();
  });
});
