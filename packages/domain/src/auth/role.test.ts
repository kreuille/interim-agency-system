import { describe, it, expect } from 'vitest';
import { canAccess, isRole, requiresMfa, ROLES } from './role.js';

describe('Role RBAC', () => {
  it('ROLES contains the 7 expected roles', () => {
    expect(ROLES).toEqual([
      'agency_admin',
      'payroll_officer',
      'dispatcher',
      'hr',
      'sales',
      'viewer',
      'auditor',
    ]);
  });

  it('isRole narrows valid strings', () => {
    expect(isRole('agency_admin')).toBe(true);
    expect(isRole('intruder')).toBe(false);
  });

  it('agency_admin can do anything', () => {
    expect(canAccess('agency_admin', 'payroll:write')).toBe(true);
    expect(canAccess('agency_admin', 'compliance:export')).toBe(true);
  });

  it('viewer is read-only', () => {
    expect(canAccess('viewer', 'worker:read')).toBe(true);
    expect(canAccess('viewer', 'worker:write')).toBe(false);
  });

  it('dispatcher cannot touch payroll', () => {
    expect(canAccess('dispatcher', 'payroll:read')).toBe(false);
    expect(canAccess('dispatcher', 'payroll:write')).toBe(false);
  });

  it('auditor reads + exports but never writes', () => {
    expect(canAccess('auditor', 'audit:read')).toBe(true);
    expect(canAccess('auditor', 'compliance:export')).toBe(true);
    expect(canAccess('auditor', 'worker:write')).toBe(false);
  });

  it('MFA required only for admin + payroll_officer', () => {
    expect(requiresMfa('agency_admin')).toBe(true);
    expect(requiresMfa('payroll_officer')).toBe(true);
    expect(requiresMfa('dispatcher')).toBe(false);
    expect(requiresMfa('viewer')).toBe(false);
  });
});
