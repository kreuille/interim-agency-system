import type {
  ActiveMissionsSnapshot,
  CctSnapshot,
  LseSnapshot,
  NlpdSnapshot,
  WorkerDocsSnapshot,
} from '@interim/domain';

/**
 * Ports d'agrégation pour le dashboard compliance (A6.1).
 *
 * Chaque port est query-only (pas d'écriture). Les implémentations
 * Prisma agrègent les données (counts, dates) sans charger d'entités
 * complètes (perf : tableau de bord sollicité fréquemment).
 */

export interface LseStatusPort {
  load(agencyId: string): Promise<LseSnapshot>;
}

export interface CctStatusPort {
  load(agencyId: string): Promise<CctSnapshot>;
}

export interface WorkerDocsStatusPort {
  load(agencyId: string, now: Date): Promise<WorkerDocsSnapshot>;
}

export interface ActiveMissionsStatusPort {
  load(agencyId: string, now: Date): Promise<ActiveMissionsSnapshot>;
}

export interface NlpdStatusPort {
  load(agencyId: string): Promise<NlpdSnapshot>;
}
