/**
 * Événements domaine de disponibilité, émis par les use cases application
 * et publiés sur l'EventBus (BullMQ ou in-memory).
 */

export interface AvailabilityDeclaredEvent {
  readonly kind: 'AvailabilityDeclared';
  readonly agencyId: string;
  readonly workerId: string;
  readonly slotId: string;
  readonly dateFrom: string;
  readonly dateTo: string;
  readonly status: 'available' | 'tentative' | 'unavailable';
  readonly source: string;
  readonly occurredAt: string;
}

export interface AvailabilityChangedEvent {
  readonly kind: 'AvailabilityChanged';
  readonly agencyId: string;
  readonly workerId: string;
  readonly slotId: string;
  readonly action: 'removed' | 'replaced';
  readonly occurredAt: string;
}

export interface AvailabilityExpiredEvent {
  readonly kind: 'AvailabilityExpired';
  readonly agencyId: string;
  readonly workerId: string;
  readonly lastUpdatedAt: string;
  readonly occurredAt: string;
}

export type AvailabilityEvent =
  | AvailabilityDeclaredEvent
  | AvailabilityChangedEvent
  | AvailabilityExpiredEvent;
