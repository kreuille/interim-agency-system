import { describe, expect, it, beforeEach } from 'vitest';
import { clear, dequeue, enqueue, pending, type PendingMutation } from './offline-queue.js';

class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
});

describe('offline queue', () => {
  const mut: PendingMutation = {
    kind: 'create-day-slot',
    dateIso: '2026-04-22',
    status: 'available',
    enqueuedAt: '2026-04-22T08:00:00.000Z',
  };

  it('enqueue then pending shows the entry', () => {
    enqueue(storage, mut);
    expect(pending(storage)).toEqual([mut]);
  });

  it('dequeue retire la première mutation FIFO', () => {
    enqueue(storage, mut);
    const second: PendingMutation = {
      kind: 'delete-slot',
      slotId: 's-1',
      enqueuedAt: '2026-04-22T08:01:00.000Z',
    };
    enqueue(storage, second);
    expect(dequeue(storage)).toEqual(mut);
    expect(pending(storage)).toEqual([second]);
  });

  it('clear vide la queue', () => {
    enqueue(storage, mut);
    clear(storage);
    expect(pending(storage)).toEqual([]);
  });

  it('renvoie [] si payload corrompu', () => {
    storage.setItem('availability-offline-queue', '{not json');
    expect(pending(storage)).toEqual([]);
  });

  it('renvoie undefined si dequeue sur queue vide', () => {
    expect(dequeue(storage)).toBeUndefined();
  });
});
