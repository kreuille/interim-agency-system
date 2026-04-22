import { describe, it, expect } from 'vitest';
import { uiCanAccess, visibleNavItems } from './rbac.js';

describe('uiCanAccess', () => {
  it('false when role undefined', () => {
    expect(uiCanAccess(undefined, 'worker:read')).toBe(false);
  });

  it('true for agency_admin on any action', () => {
    expect(uiCanAccess('agency_admin', 'worker:write')).toBe(true);
    expect(uiCanAccess('agency_admin', 'compliance:export')).toBe(true);
  });

  it('false for viewer on write actions', () => {
    expect(uiCanAccess('viewer', 'worker:read')).toBe(true);
    expect(uiCanAccess('viewer', 'worker:write')).toBe(false);
  });
});

describe('visibleNavItems', () => {
  const ALL = [
    { label: 'Dashboard', href: '/' },
    { label: 'Workers', href: '/workers', requires: 'worker:read' as const },
    { label: 'New worker', href: '/workers/new', requires: 'worker:write' as const },
  ];

  it('viewer sees Dashboard + Workers (read), not New worker (write)', () => {
    const items = visibleNavItems('viewer', ALL);
    expect(items.map((i) => i.label)).toEqual(['Dashboard', 'Workers']);
  });

  it('agency_admin sees everything', () => {
    expect(visibleNavItems('agency_admin', ALL)).toHaveLength(3);
  });
});
