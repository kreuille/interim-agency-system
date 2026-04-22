export const ROLES = [
  'agency_admin',
  'payroll_officer',
  'dispatcher',
  'hr',
  'sales',
  'viewer',
  'auditor',
] as const;

export type Role = (typeof ROLES)[number];

export const MFA_REQUIRED_ROLES: ReadonlySet<Role> = new Set(['agency_admin', 'payroll_officer']);

export type Action =
  | 'worker:read'
  | 'worker:write'
  | 'worker:delete'
  | 'client:read'
  | 'client:write'
  | 'payroll:read'
  | 'payroll:write'
  | 'invoice:read'
  | 'invoice:write'
  | 'proposal:read'
  | 'proposal:write'
  | 'timesheet:read'
  | 'timesheet:write'
  | 'audit:read'
  | 'compliance:export';

const RBAC_MATRIX: Readonly<Record<Role, ReadonlySet<Action>>> = {
  agency_admin: new Set<Action>([
    'worker:read',
    'worker:write',
    'worker:delete',
    'client:read',
    'client:write',
    'payroll:read',
    'payroll:write',
    'invoice:read',
    'invoice:write',
    'proposal:read',
    'proposal:write',
    'timesheet:read',
    'timesheet:write',
    'audit:read',
    'compliance:export',
  ]),
  payroll_officer: new Set<Action>([
    'worker:read',
    'client:read',
    'payroll:read',
    'payroll:write',
    'invoice:read',
    'invoice:write',
    'timesheet:read',
    'audit:read',
  ]),
  dispatcher: new Set<Action>([
    'worker:read',
    'worker:write',
    'client:read',
    'proposal:read',
    'proposal:write',
    'timesheet:read',
    'timesheet:write',
  ]),
  hr: new Set<Action>([
    'worker:read',
    'worker:write',
    'worker:delete',
    'client:read',
    'audit:read',
  ]),
  sales: new Set<Action>(['client:read', 'client:write', 'invoice:read', 'proposal:read']),
  viewer: new Set<Action>([
    'worker:read',
    'client:read',
    'payroll:read',
    'invoice:read',
    'proposal:read',
    'timesheet:read',
  ]),
  auditor: new Set<Action>([
    'worker:read',
    'client:read',
    'payroll:read',
    'invoice:read',
    'proposal:read',
    'timesheet:read',
    'audit:read',
    'compliance:export',
  ]),
};

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function canAccess(role: Role, action: Action): boolean {
  return RBAC_MATRIX[role].has(action);
}

export function requiresMfa(role: Role): boolean {
  return MFA_REQUIRED_ROLES.has(role);
}
