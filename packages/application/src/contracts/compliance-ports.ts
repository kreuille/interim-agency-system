import type { AgencyId, ClientId, StaffId } from '@interim/domain';

/**
 * Ports outbound nécessaires au use case `GenerateMissionContractUseCase`
 * pour valider les invariants légaux pré-création (LSE, permis, LTr).
 */

/**
 * Statut LSE d'une agence (cf.
 * `skills/compliance/lse-authorization/SKILL.md`). L'agence doit avoir
 * une autorisation cantonale active dont la date d'expiration couvre la
 * fin de mission.
 */
export interface LseAuthorizationView {
  readonly status: 'active' | 'pending' | 'expired' | 'revoked';
  readonly authorizationNumber: string;
  readonly expiresAt: Date;
}

export interface LseAuthorizationLookup {
  findByAgency(agencyId: AgencyId): Promise<LseAuthorizationView | undefined>;
}

/**
 * Statut permis de travail d'un intérimaire. Doit être valide jusqu'à
 * la fin de mission. `category` indique le type (B, C, F, G, L, Ci, etc.)
 * mais on n'exige rien de spécifique sur la catégorie ici.
 */
export interface WorkPermitView {
  readonly category: string;
  readonly valid: boolean;
  readonly expiresAt: Date;
}

export interface WorkPermitLookup {
  findByWorker(agencyId: AgencyId, workerId: StaffId): Promise<WorkPermitView | undefined>;
}

/**
 * Cumul des heures déjà programmées sur la semaine ISO (toutes missions
 * actives). Utilisé pour vérifier le plafond LTr `cumul + nouveau ≤ 50h/sem`.
 */
export interface WeeklyHoursLookup {
  cumulHours(input: {
    readonly agencyId: AgencyId;
    readonly workerId: StaffId;
    readonly isoYearWeek: string; // ex. "2026-W17"
  }): Promise<number>;
}

/**
 * Snapshot agence (nom + IDE), résolu via le repository client + agency.
 */
export interface AgencyProfileView {
  readonly name: string;
  readonly ide: string;
}

export interface AgencyProfileLookup {
  findById(agencyId: AgencyId): Promise<AgencyProfileView | undefined>;
}

/**
 * Snapshot client par ID, pour récupérer le nom et l'IDE à inscrire dans
 * le contrat.
 */
export interface ClientProfileView {
  readonly name: string;
  readonly ide: string;
}

export interface ClientProfileLookup {
  findById(agencyId: AgencyId, clientId: ClientId): Promise<ClientProfileView | undefined>;
}
