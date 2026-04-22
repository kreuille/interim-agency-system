import {
  buildSecoCsvBundle,
  computeSecoStats,
  type SecoCsvBundle,
  type SecoExportBundle,
  type SecoExportRange,
} from '@interim/domain';
import type { Clock, Result } from '@interim/shared';
import type {
  SecoContractsDataPort,
  SecoExportAuditLogger,
  SecoLseInfoPort,
  SecoMissionsDataPort,
  SecoTimesheetsDataPort,
  SecoWorkersDataPort,
} from './seco-export-ports.js';

/**
 * Use case A6.2 : génère le bundle SECO complet (1 clic admin/auditor).
 *
 * Flux :
 *   1. Charge en parallèle (Promise.all) les 5 sources : LSE info,
 *      workers, missions, contrats, timesheets sur la période.
 *   2. Calcule stats agrégées (counts, total heures, anomalies).
 *   3. Compose `SecoExportBundle` immutable.
 *   4. Génère 4 CSV + 1 résumé text via `buildSecoCsvBundle` (domain).
 *   5. Loggue l'export dans audit (qui, quand, quoi — nLPD art. 12).
 *
 * Le ZIP final + signed URL est assemblé en infra (DETTE-100).
 *
 * RBAC : exigé `compliance:export` côté controller.
 *
 * Idempotence : pas requise (c'est un export read-only, peut être
 * relancé sans effet de bord).
 */

export type GenerateSecoExportErrorKind = 'invalid_range' | 'lse_load_failed' | 'data_load_failed';

export class GenerateSecoExportError extends Error {
  constructor(
    public readonly kind: GenerateSecoExportErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'GenerateSecoExportError';
  }
}

export interface GenerateSecoExportInput {
  readonly agencyId: string;
  readonly agencyName: string;
  readonly range: SecoExportRange;
  readonly actorUserId: string;
  readonly actorIp?: string;
}

export interface GenerateSecoExportOutput {
  readonly bundle: SecoExportBundle;
  readonly csvBundle: SecoCsvBundle;
}

export class GenerateSecoExportUseCase {
  constructor(
    private readonly workers: SecoWorkersDataPort,
    private readonly missions: SecoMissionsDataPort,
    private readonly contracts: SecoContractsDataPort,
    private readonly timesheets: SecoTimesheetsDataPort,
    private readonly lse: SecoLseInfoPort,
    private readonly audit: SecoExportAuditLogger,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: GenerateSecoExportInput,
  ): Promise<Result<GenerateSecoExportOutput, GenerateSecoExportError>> {
    if (!isValidRange(input.range)) {
      return failure(
        'invalid_range',
        `Range invalide : from=${input.range.fromIso} to=${input.range.toIso}`,
      );
    }

    let lseInfo;
    try {
      lseInfo = await this.lse.load(input.agencyId);
    } catch (err) {
      return failure('lse_load_failed', err instanceof Error ? err.message : 'unknown_lse_error');
    }

    const portInput = { agencyId: input.agencyId, range: input.range };
    let workers, missions, contracts, timesheets;
    try {
      [workers, missions, contracts, timesheets] = await Promise.all([
        this.workers.load(portInput),
        this.missions.load(portInput),
        this.contracts.load(portInput),
        this.timesheets.load(portInput),
      ]);
    } catch (err) {
      return failure('data_load_failed', err instanceof Error ? err.message : 'unknown_data_error');
    }

    const generatedAt = this.clock.now();
    const stats = computeSecoStats({ workers, missions, contracts, timesheets });

    const bundle: SecoExportBundle = {
      agencyId: input.agencyId,
      agencyName: input.agencyName,
      range: input.range,
      generatedAtIso: generatedAt.toISOString(),
      lse: lseInfo,
      workers,
      missions,
      contracts,
      timesheets,
      stats,
    };

    const csvBundle = buildSecoCsvBundle(bundle);

    await this.audit.recordExport({
      agencyId: input.agencyId,
      actorUserId: input.actorUserId,
      ...(input.actorIp ? { actorIp: input.actorIp } : {}),
      range: input.range,
      generatedAtIso: bundle.generatedAtIso,
      stats: { workersCount: stats.workersCount, timesheetsCount: stats.timesheetsCount },
    });

    return { ok: true, value: { bundle, csvBundle } };
  }
}

function isValidRange(r: SecoExportRange): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.fromIso) || !/^\d{4}-\d{2}-\d{2}$/.test(r.toIso)) {
    return false;
  }
  return r.fromIso <= r.toIso;
}

function failure(
  kind: GenerateSecoExportErrorKind,
  message: string,
): { readonly ok: false; readonly error: GenerateSecoExportError } {
  return { ok: false, error: new GenerateSecoExportError(kind, message) };
}
