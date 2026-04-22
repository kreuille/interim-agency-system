/**
 * File de modifications en attente quand l'utilisateur est offline.
 * Stockée dans `localStorage` sous la clé `availability-offline-queue`.
 *
 * Format minimal : un événement de toggle journalier.
 * Le SW (déclaré dans `public/sw.js`) intercepte les POST/DELETE
 * échoués → réenqueue dans cette liste, sync à la reconnexion.
 */

export type PendingMutation =
  | {
      readonly kind: 'create-day-slot';
      readonly dateIso: string; // YYYY-MM-DD
      readonly status: 'available' | 'unavailable';
      readonly enqueuedAt: string;
    }
  | {
      readonly kind: 'delete-slot';
      readonly slotId: string;
      readonly enqueuedAt: string;
    };

const KEY = 'availability-offline-queue';

interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

function read(storage: StorageLike): PendingMutation[] {
  const raw = storage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PendingMutation[]) : [];
  } catch {
    return [];
  }
}

export function enqueue(storage: StorageLike, mutation: PendingMutation): void {
  const list = read(storage);
  list.push(mutation);
  storage.setItem(KEY, JSON.stringify(list));
}

export function pending(storage: StorageLike): readonly PendingMutation[] {
  return read(storage);
}

export function clear(storage: StorageLike): void {
  storage.removeItem(KEY);
}

/**
 * Retire la première mutation et la renvoie. Renvoie undefined si vide.
 */
export function dequeue(storage: StorageLike): PendingMutation | undefined {
  const list = read(storage);
  const first = list.shift();
  if (first === undefined) return undefined;
  storage.setItem(KEY, JSON.stringify(list));
  return first;
}
