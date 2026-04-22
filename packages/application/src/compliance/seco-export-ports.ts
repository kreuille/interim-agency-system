import type {
  SecoContractRow,
  SecoExportRange,
  SecoLseInfo,
  SecoMissionRow,
  SecoTimesheetRow,
  SecoWorkerRow,
} from '@interim/domain';

/**
 * Ports de chargement pour le bundle SECO (A6.2).
 *
 * Chaque port renvoie les rows déjà projetées (DTO plats prêts pour
 * CSV). Implémentations Prisma feront des SELECT optimisés.
 */

export interface SecoWorkersDataPort {
  load(input: { agencyId: string; range: SecoExportRange }): Promise<readonly SecoWorkerRow[]>;
}

export interface SecoMissionsDataPort {
  load(input: { agencyId: string; range: SecoExportRange }): Promise<readonly SecoMissionRow[]>;
}

export interface SecoContractsDataPort {
  load(input: { agencyId: string; range: SecoExportRange }): Promise<readonly SecoContractRow[]>;
}

export interface SecoTimesheetsDataPort {
  load(input: { agencyId: string; range: SecoExportRange }): Promise<readonly SecoTimesheetRow[]>;
}

export interface SecoLseInfoPort {
  load(agencyId: string): Promise<SecoLseInfo>;
}

export interface SecoExportAuditLogger {
  recordExport(input: {
    readonly agencyId: string;
    readonly actorUserId: string;
    readonly actorIp?: string;
    readonly range: SecoExportRange;
    readonly generatedAtIso: string;
    readonly stats: { readonly workersCount: number; readonly timesheetsCount: number };
  }): Promise<void>;
}
