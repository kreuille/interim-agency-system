import type { Prisma, PrismaClient } from '@prisma/client';
import { tryCurrentTenant } from '../../shared/context/tenant-context.js';

/**
 * Liste des modèles multi-tenant (portent une colonne `agency_id`).
 * Les modèles qui n'y figurent PAS (ex. `Agency` lui-même, idempotency keys
 * gérés explicitement) ne sont pas concernés par l'injection automatique.
 */
export const TENANT_MODELS: ReadonlySet<string> = new Set([
  'TempWorker',
  'WorkerDocument',
  'Qualification',
  'DrivingLicense',
  'Client',
  'ClientContract',
  'RateCard',
  'WorkerAvailability',
  'MissionProposal',
  'MissionContract',
  'Timesheet',
  'Payslip',
  'Invoice',
  'AuditLogEntry',
  'LseAuthorization',
]);

/**
 * Opérations dont le `where` ou le `data` doit être vérifié pour empêcher
 * une lecture ou mutation cross-tenant.
 */
export const TENANT_GUARDED_ACTIONS: ReadonlySet<string> = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'findUnique',
  'findUniqueOrThrow',
  'update',
  'updateMany',
  'upsert',
  'create',
  'createMany',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
]);

export class CrossTenantLeak extends Error {
  constructor(model: string, action: string, expected: string, got: string) {
    super(
      `CrossTenantLeak: ${model}.${action} — contexte tenant=${expected}, requête manipule ${got}`,
    );
    this.name = 'CrossTenantLeak';
  }
}

export interface GuardCheckInput {
  readonly model: string;
  readonly operation: string;
  readonly args: { where?: Record<string, unknown>; data?: Record<string, unknown> } | undefined;
  readonly contextAgencyId: string;
}

/**
 * Vérifie qu'une opération Prisma n'essaie pas de lire/écrire un autre tenant
 * que celui du contexte actif. Pure function, facilement testable.
 *
 * @throws CrossTenantLeak si un `agencyId` explicite différent est détecté.
 */
export function assertTenantConsistent(input: GuardCheckInput): void {
  if (!TENANT_MODELS.has(input.model)) return;
  if (!TENANT_GUARDED_ACTIONS.has(input.operation)) return;

  const { args, contextAgencyId, model, operation } = input;
  if (!args) return;

  const where = args.where;
  if (where && 'agencyId' in where) {
    const value = where.agencyId;
    if (typeof value === 'string' && value !== contextAgencyId) {
      throw new CrossTenantLeak(model, operation, contextAgencyId, value);
    }
  }

  const data = args.data;
  if (data && 'agencyId' in data) {
    const value = data.agencyId;
    if (typeof value === 'string' && value !== contextAgencyId) {
      throw new CrossTenantLeak(model, operation, contextAgencyId, value);
    }
  }
}

/**
 * Pose la garde en extension Prisma : pour chaque opération sur un modèle
 * tenant, appelle `assertTenantConsistent` avant de déléguer la requête.
 *
 * Le code métier reste responsable d'inclure `agencyId` dans le `where` ;
 * cette garde est du defense-in-depth (refuse les fuites accidentelles),
 * pas un substitut à la discipline d'écriture.
 */
export function installTenantGuard(prisma: PrismaClient): ReturnType<PrismaClient['$extends']> {
  return prisma.$extends({
    name: 'tenant-guard',
    query: {
      $allModels: {
        $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: unknown;
          query: (a: unknown) => Promise<unknown>;
        }) {
          const tenant = tryCurrentTenant();
          if (tenant) {
            assertTenantConsistent({
              model,
              operation,
              args: args as GuardCheckInput['args'],
              contextAgencyId: tenant.agencyId,
            });
          }
          return query(args);
        },
      },
    },
  });
}

// Re-export pour typer les consommateurs sans casser leur type Prisma.
export type GuardedPrisma = ReturnType<typeof installTenantGuard>;

// Marque le type Prisma utilisé (évite l'import non-utilisé).
export type PrismaActionRef = Prisma.PrismaAction;
