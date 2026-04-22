import { canAccess, type Action, type Role } from '@interim/domain';

/**
 * Garde l'icône / le bouton si l'user n'a pas le droit (pas seulement masquer).
 * Côté client : empêche le clic ; côté serveur : double-check toujours via API.
 */
export function uiCanAccess(role: Role | undefined, action: Action): boolean {
  if (!role) return false;
  return canAccess(role, action);
}

export interface NavItem {
  readonly label: string;
  readonly href: string;
  readonly requires?: Action;
}

export function visibleNavItems(role: Role | undefined, items: readonly NavItem[]): NavItem[] {
  return items.filter((item) => !item.requires || uiCanAccess(role, item.requires));
}
