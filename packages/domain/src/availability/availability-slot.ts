import type { Clock } from '@interim/shared';
import { DomainError } from '../workers/errors.js';

export const SLOT_STATUSES = ['available', 'tentative', 'unavailable'] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

export const SLOT_SOURCES = ['internal', 'worker_self', 'api', 'moveplanner_push'] as const;
export type SlotSource = (typeof SLOT_SOURCES)[number];

export const FRESHNESS_LEVELS = ['realtime', 'cached', 'stale'] as const;
export type Freshness = (typeof FRESHNESS_LEVELS)[number];

export interface AvailabilitySlotProps {
  readonly id: string;
  readonly dateFrom: Date;
  readonly dateTo: Date;
  readonly status: SlotStatus;
  readonly source: SlotSource;
  readonly reason?: string;
  /** RRULE RFC 5545 minimal subset : `FREQ=WEEKLY;BYDAY=WE` etc. */
  readonly rrule?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class InvalidSlotWindow extends DomainError {
  constructor() {
    super('invalid_slot_window', 'dateTo doit être strictement après dateFrom');
  }
}

export interface ExpandedInstance {
  readonly slotId: string;
  readonly dateFrom: Date;
  readonly dateTo: Date;
  readonly status: SlotStatus;
  readonly source: SlotSource;
  readonly reason?: string;
}

/**
 * Subset RFC 5545 supporté :
 * - FREQ=WEEKLY (par jour de semaine)
 * - BYDAY=MO,TU,WE,TH,FR,SA,SU (au moins un)
 * - COUNT=N (optionnel) ou UNTIL=YYYYMMDD'T'HHmmss'Z' (optionnel)
 *
 * Pour le MVP intérim, c'est largement suffisant pour les indispos
 * récurrentes du type "tous les mercredis" ou "lundi/mardi/jeudi".
 */
const DAY_CODES: readonly string[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function expandSlot(slot: AvailabilitySlotProps, until: Date): readonly ExpandedInstance[] {
  if (slot.dateTo.getTime() <= slot.dateFrom.getTime()) {
    throw new InvalidSlotWindow();
  }
  const baseDuration = slot.dateTo.getTime() - slot.dateFrom.getTime();
  const baseInstance: ExpandedInstance = {
    slotId: slot.id,
    dateFrom: slot.dateFrom,
    dateTo: slot.dateTo,
    status: slot.status,
    source: slot.source,
    ...(slot.reason !== undefined ? { reason: slot.reason } : {}),
  };

  if (!slot.rrule) return [baseInstance];

  const parsed = parseRRule(slot.rrule);
  if (!parsed) return [baseInstance];

  const instances: ExpandedInstance[] = [baseInstance];
  const stop = parsed.until && parsed.until.getTime() < until.getTime() ? parsed.until : until;

  // Marche jour par jour à partir du lendemain de dateFrom.
  const cursor = new Date(slot.dateFrom.getTime() + 24 * 3600 * 1000);
  let count = 1;
  while (cursor.getTime() <= stop.getTime()) {
    if (parsed.count !== undefined && count >= parsed.count) break;
    const dayCode = DAY_CODES[cursor.getUTCDay()];
    if (dayCode !== undefined && parsed.byDay.includes(dayCode)) {
      const dateFrom = new Date(cursor.getTime());
      const dateTo = new Date(dateFrom.getTime() + baseDuration);
      instances.push({
        slotId: slot.id,
        dateFrom,
        dateTo,
        status: slot.status,
        source: slot.source,
        ...(slot.reason !== undefined ? { reason: slot.reason } : {}),
      });
      count += 1;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return instances;
}

interface ParsedRRule {
  readonly freq: 'WEEKLY';
  readonly byDay: readonly string[];
  readonly count?: number;
  readonly until?: Date;
}

function parseRRule(rrule: string): ParsedRRule | undefined {
  const parts = new Map<string, string>();
  for (const segment of rrule.split(';')) {
    const [k, v] = segment.split('=');
    if (k && v) parts.set(k.toUpperCase(), v);
  }
  if (parts.get('FREQ') !== 'WEEKLY') return undefined;
  const byDay = (parts.get('BYDAY') ?? '').split(',').filter((d) => d.length > 0);
  if (byDay.length === 0) return undefined;
  const result: { freq: 'WEEKLY'; byDay: readonly string[]; count?: number; until?: Date } = {
    freq: 'WEEKLY',
    byDay,
  };
  const countStr = parts.get('COUNT');
  if (countStr) {
    const n = Number(countStr);
    if (!Number.isNaN(n) && n > 0) result.count = n;
  }
  const untilStr = parts.get('UNTIL');
  if (untilStr) {
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(untilStr);
    if (m) {
      result.until = new Date(
        Date.UTC(
          Number(m[1]),
          Number(m[2]) - 1,
          Number(m[3]),
          Number(m[4]),
          Number(m[5]),
          Number(m[6]),
        ),
      );
    }
  }
  return result;
}

const UNAVAILABLE_OVERRIDES_AVAILABLE: ReadonlySet<SlotStatus> = new Set(['unavailable']);

/**
 * Résout les chevauchements entre slots étendus (post-RRULE expansion) :
 *  1. Si plusieurs instances couvrent le même instant, `unavailable` prime
 *     sur `available` et `tentative`.
 *  2. À statut égal, la dernière mise à jour (passée via comparator) gagne.
 *
 * Renvoie un tableau d'intervalles non-chevauchés ordonnés par dateFrom.
 */
export function resolveOverlaps(
  instances: readonly ExpandedInstance[],
  lastUpdated: ReadonlyMap<string, Date>,
): readonly ExpandedInstance[] {
  if (instances.length === 0) return [];
  // Collecte tous les points de découpe.
  const points = new Set<number>();
  for (const i of instances) {
    points.add(i.dateFrom.getTime());
    points.add(i.dateTo.getTime());
  }
  const ordered = [...points].sort((a, b) => a - b);

  const result: ExpandedInstance[] = [];
  for (let i = 0; i < ordered.length - 1; i++) {
    const sliceStart = ordered[i];
    const sliceEnd = ordered[i + 1];
    if (sliceStart === undefined || sliceEnd === undefined) continue;
    const covering = instances.filter(
      (s) => s.dateFrom.getTime() < sliceEnd && s.dateTo.getTime() > sliceStart,
    );
    if (covering.length === 0) continue;
    const winner = pickWinner(covering, lastUpdated);
    result.push({
      slotId: winner.slotId,
      dateFrom: new Date(sliceStart),
      dateTo: new Date(sliceEnd),
      status: winner.status,
      source: winner.source,
      ...(winner.reason !== undefined ? { reason: winner.reason } : {}),
    });
  }
  // Fusionne les segments adjacents identiques.
  return mergeAdjacent(result);
}

function pickWinner(
  candidates: readonly ExpandedInstance[],
  lastUpdated: ReadonlyMap<string, Date>,
): ExpandedInstance {
  // 1) unavailable prime
  const unavailable = candidates.filter((c) => UNAVAILABLE_OVERRIDES_AVAILABLE.has(c.status));
  const pool = unavailable.length > 0 ? unavailable : candidates;
  // 2) à statut égal, last updated wins
  return pool.reduce((best, c) => {
    const bestUpdated = lastUpdated.get(best.slotId)?.getTime() ?? 0;
    const cUpdated = lastUpdated.get(c.slotId)?.getTime() ?? 0;
    return cUpdated > bestUpdated ? c : best;
  });
}

function mergeAdjacent(instances: readonly ExpandedInstance[]): readonly ExpandedInstance[] {
  if (instances.length === 0) return [];
  const sorted = [...instances].sort((a, b) => a.dateFrom.getTime() - b.dateFrom.getTime());
  const first = sorted[0];
  if (first === undefined) return [];
  const merged: ExpandedInstance[] = [first];
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = sorted[i];
    if (prev === undefined || curr === undefined) continue;
    if (
      prev.slotId === curr.slotId &&
      prev.status === curr.status &&
      prev.source === curr.source &&
      prev.dateTo.getTime() === curr.dateFrom.getTime()
    ) {
      merged[merged.length - 1] = {
        slotId: prev.slotId,
        dateFrom: prev.dateFrom,
        dateTo: curr.dateTo,
        status: prev.status,
        source: prev.source,
        ...(prev.reason !== undefined ? { reason: prev.reason } : {}),
      };
    } else {
      merged.push(curr);
    }
  }
  return merged;
}

const TTL_HOURS = 4;

/**
 * Calcule la fraîcheur d'une donnée disponibilité par rapport à `now`.
 * - realtime : mise à jour < 30 min
 * - cached   : mise à jour < 4 h
 * - stale    : mise à jour > 4 h → événement `AvailabilityExpired` à émettre
 */
export function freshnessFromUpdate(lastUpdatedAt: Date, clock: Clock): Freshness {
  const ageMs = clock.now().getTime() - lastUpdatedAt.getTime();
  if (ageMs < 30 * 60 * 1000) return 'realtime';
  if (ageMs < TTL_HOURS * 3600 * 1000) return 'cached';
  return 'stale';
}
