import { PrismaClient } from '@prisma/client';
import { installTenantGuard, type GuardedPrisma } from './tenant-guard.js';

/**
 * Crée un client Prisma de base (sans garde). Utile pour les jobs système
 * qui tournent hors contexte tenant (migrations, cleanup, etc.).
 */
export function createPrismaClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });
}

/**
 * Client Prisma avec tenant-guard installé : empêche les fuites cross-tenant
 * en vérifiant chaque opération contre le TenantContext courant.
 * À utiliser dans tout le code applicatif derrière l'auth middleware.
 */
export function createGuardedPrismaClient(): GuardedPrisma {
  return installTenantGuard(createPrismaClient());
}
