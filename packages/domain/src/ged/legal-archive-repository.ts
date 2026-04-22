import type { AgencyId } from '../shared/ids.js';
import type { LegalArchiveEntry, LegalCategory } from './legal-archive-entry.js';

/**
 * Port repository pour les entrées d'archive légale.
 *
 * Note multi-tenant : toute query exige `agencyId` (CLAUDE.md §3.5).
 * Les implémentations Prisma doivent ajouter `where: { agencyId }` même
 * pour les lookups par ID.
 */
export interface LegalArchiveRepository {
  /**
   * Insère une nouvelle entrée. **Append-only** : aucune mise à jour,
   * aucune suppression possible via cette interface (la suppression
   * passe par `purge()` qui vérifie `retentionUntil`).
   */
  insert(entry: LegalArchiveEntry): Promise<void>;

  /** Lookup par ID, scope agency. */
  findById(agencyId: AgencyId, id: string): Promise<LegalArchiveEntry | undefined>;

  /**
   * Recherche les entrées d'une entité métier référencée (ex. tous les
   * archives liées à un MissionContract donné).
   */
  findByReference(
    agencyId: AgencyId,
    referenceEntityType: string,
    referenceEntityId: string,
  ): Promise<readonly LegalArchiveEntry[]>;

  /**
   * Liste les entrées dont la rétention est dépassée à `now`. Utilisé
   * par le job de purge mensuel.
   */
  listPurgeable(
    now: Date,
    opts?: { readonly limit?: number },
  ): Promise<readonly LegalArchiveEntry[]>;

  /**
   * Supprime une entrée. **Doit refuser** si la rétention n'est pas
   * dépassée (vérif redondante avec le use case, defense in depth).
   */
  purge(agencyId: AgencyId, id: string, now: Date): Promise<void>;

  /**
   * Compte les entrées d'une catégorie pour reporting (DPO, audit SECO).
   */
  countByCategory(agencyId: AgencyId, category: LegalCategory): Promise<number>;
}
