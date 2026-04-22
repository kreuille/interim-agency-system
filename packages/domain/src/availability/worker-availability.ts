import { randomUUID } from 'node:crypto';
import type { Clock } from '@interim/shared';
import type { AgencyId, StaffId } from '../shared/ids.js';
import { DomainError } from '../workers/errors.js';
import {
  expandSlot,
  freshnessFromUpdate,
  resolveOverlaps,
  type AvailabilitySlotProps,
  type ExpandedInstance,
  type Freshness,
  type SlotSource,
  type SlotStatus,
} from './availability-slot.js';

export type WorkerAvailabilityId = string & { readonly __brand: 'WorkerAvailabilityId' };

export function asWorkerAvailabilityId(value: string): WorkerAvailabilityId {
  if (value.length === 0) throw new Error('WorkerAvailabilityId cannot be empty');
  return value as WorkerAvailabilityId;
}

export interface WorkerAvailabilityProps {
  readonly id: WorkerAvailabilityId;
  readonly agencyId: AgencyId;
  readonly workerId: StaffId;
  readonly slots: readonly AvailabilitySlotProps[];
  readonly lastUpdatedAt: Date;
  readonly ttlExpiresAt: Date;
}

export interface AddSlotInput {
  readonly dateFrom: Date;
  readonly dateTo: Date;
  readonly status: SlotStatus;
  readonly source: SlotSource;
  readonly reason?: string;
  readonly rrule?: string;
}

const DEFAULT_TTL_HOURS = 4;

export class SlotNotFound extends DomainError {
  constructor(id: string) {
    super('slot_not_found', `Slot ${id} introuvable`);
  }
}

/**
 * Aggregat racine : disponibilités d'un intérimaire pour son agence.
 * Une seule instance par (agencyId, workerId).
 *
 * Slots sont immuables une fois créés (immutabilité = audit). Modifier
 * une plage = supprimer l'ancien slot et en ajouter un nouveau (génère
 * deux events distincts).
 */
export class WorkerAvailability {
  private constructor(private props: WorkerAvailabilityProps) {}

  static create(input: {
    id: WorkerAvailabilityId;
    agencyId: AgencyId;
    workerId: StaffId;
    clock: Clock;
  }): WorkerAvailability {
    const now = input.clock.now();
    return new WorkerAvailability({
      id: input.id,
      agencyId: input.agencyId,
      workerId: input.workerId,
      slots: [],
      lastUpdatedAt: now,
      ttlExpiresAt: new Date(now.getTime() + DEFAULT_TTL_HOURS * 3600 * 1000),
    });
  }

  static rehydrate(props: WorkerAvailabilityProps): WorkerAvailability {
    return new WorkerAvailability(props);
  }

  addSlot(input: AddSlotInput, clock: Clock): AvailabilitySlotProps {
    if (input.dateTo.getTime() <= input.dateFrom.getTime()) {
      throw new DomainError('invalid_slot_window', 'dateTo doit être strictement après dateFrom');
    }
    const now = clock.now();
    const slot: AvailabilitySlotProps = {
      id: randomUUID(),
      dateFrom: input.dateFrom,
      dateTo: input.dateTo,
      status: input.status,
      source: input.source,
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
      ...(input.rrule !== undefined ? { rrule: input.rrule } : {}),
      createdAt: now,
      updatedAt: now,
    };
    this.props = {
      ...this.props,
      slots: [...this.props.slots, slot],
      lastUpdatedAt: now,
      ttlExpiresAt: new Date(now.getTime() + DEFAULT_TTL_HOURS * 3600 * 1000),
    };
    return slot;
  }

  removeSlot(slotId: string, clock: Clock): void {
    const found = this.props.slots.find((s) => s.id === slotId);
    if (!found) throw new SlotNotFound(slotId);
    const now = clock.now();
    this.props = {
      ...this.props,
      slots: this.props.slots.filter((s) => s.id !== slotId),
      lastUpdatedAt: now,
      ttlExpiresAt: new Date(now.getTime() + DEFAULT_TTL_HOURS * 3600 * 1000),
    };
  }

  /**
   * Retourne les instances effectives sur la fenêtre [from, to]
   * après expansion RRULE et résolution des chevauchements.
   */
  effectiveInstances(from: Date, to: Date): readonly ExpandedInstance[] {
    const lastUpdated = new Map<string, Date>();
    const expanded: ExpandedInstance[] = [];
    for (const slot of this.props.slots) {
      lastUpdated.set(slot.id, slot.updatedAt);
      const slotInstances = expandSlot(slot, to);
      for (const inst of slotInstances) {
        if (inst.dateTo.getTime() < from.getTime()) continue;
        if (inst.dateFrom.getTime() > to.getTime()) continue;
        expanded.push(inst);
      }
    }
    return resolveOverlaps(expanded, lastUpdated);
  }

  freshness(clock: Clock): Freshness {
    return freshnessFromUpdate(this.props.lastUpdatedAt, clock);
  }

  toSnapshot(): Readonly<WorkerAvailabilityProps> {
    return Object.freeze({ ...this.props, slots: this.props.slots.map((s) => ({ ...s })) });
  }

  get id(): WorkerAvailabilityId {
    return this.props.id;
  }

  get agencyId(): AgencyId {
    return this.props.agencyId;
  }

  get workerId(): StaffId {
    return this.props.workerId;
  }
}
