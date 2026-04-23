import type { PrismaClient } from '@prisma/client';
import type { Role } from '@interim/domain';
import type { DecodedAuthToken, TokenVerifier } from '../../shared/middleware/auth.middleware.js';

/**
 * Implémentation `TokenVerifier` pour preview / dev uniquement.
 *
 * **⚠️ NE JAMAIS utiliser en production.** Cette implémentation accepte
 * N'IMPORTE QUEL token et retourne un user mock `agency_admin` rattaché
 * à la première agence trouvée en DB (seed `prisma/seed.ts`).
 *
 * Activation : env var `AUTH_MODE=dev` dans `apps/api/src/main.ts`.
 *
 * Le `agencyId` peut être surchargé via `DEV_AGENCY_ID` ; sinon on
 * requête `SELECT id FROM agency LIMIT 1` au premier appel (cache hit
 * sur les appels suivants).
 *
 * @see apps/api/src/main.ts pour le câblage conditionnel
 * @see docs/runbooks/preview-deployment.md (à venir — Phase 2)
 */
export class DevTokenVerifier implements TokenVerifier {
  private cachedAgencyId: string | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly overrides: {
      readonly agencyId?: string;
      readonly role?: Role;
      readonly uid?: string;
    } = {},
  ) {
    // Si fourni via env, on cache tout de suite — pas besoin de requête DB.
    if (overrides.agencyId) {
      this.cachedAgencyId = overrides.agencyId;
    }
  }

  async verifyIdToken(_token: string): Promise<DecodedAuthToken> {
    // Token ignoré : n'importe quelle string Bearer passe. C'est
    // volontaire — cette impl est pour preview/demo, pas pour prod.
    const agencyId = await this.resolveAgencyId();

    return {
      uid: this.overrides.uid ?? 'dev-user-001',
      agencyId,
      role: this.overrides.role ?? 'agency_admin',
      // MFA + email verified hardcoded true : en dev on ne bloque pas sur ces checks
      emailVerified: true,
      mfaVerified: true,
    };
  }

  private async resolveAgencyId(): Promise<string> {
    if (this.cachedAgencyId !== undefined) {
      return this.cachedAgencyId;
    }

    const agency = await this.prisma.agency.findFirst({
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    if (!agency) {
      throw new Error(
        "DevTokenVerifier: aucune agence trouvée en DB. Lancez `pnpm -F @interim/api prisma:seed` pour créer l'agence de test (Agence Pilote SA).",
      );
    }

    this.cachedAgencyId = agency.id;
    return agency.id;
  }
}
