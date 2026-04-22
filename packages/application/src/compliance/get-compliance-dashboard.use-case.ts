import {
  buildActiveMissionsIndicator,
  buildCctIndicator,
  buildLseIndicator,
  buildNlpdIndicator,
  buildWorkerDocsIndicator,
  worstStatusOf,
  type ComplianceDashboardSnapshot,
  type ComplianceIndicator,
} from '@interim/domain';
import type { Clock } from '@interim/shared';
import type {
  ActiveMissionsStatusPort,
  CctStatusPort,
  LseStatusPort,
  NlpdStatusPort,
  WorkerDocsStatusPort,
} from './dashboard-ports.js';

/**
 * Aggregate les 5 indicateurs compliance pour le dashboard A6.1.
 *
 * Charge en parallèle (Promise.all) pour minimiser latence (5 queries
 * différentes, dashboard sollicité ~1× par minute par utilisateur).
 *
 * Pure orchestration : ne contient aucune logique métier (déléguée aux
 * builders domain). Si un port échoue, l'indicateur correspondant est
 * remplacé par un indicateur `critical` "données indisponibles" (pas
 * d'erreur globale — le dashboard reste affichable).
 */

export interface GetComplianceDashboardInput {
  readonly agencyId: string;
}

export class GetComplianceDashboardUseCase {
  constructor(
    private readonly lse: LseStatusPort,
    private readonly cct: CctStatusPort,
    private readonly workerDocs: WorkerDocsStatusPort,
    private readonly missions: ActiveMissionsStatusPort,
    private readonly nlpd: NlpdStatusPort,
    private readonly clock: Clock,
  ) {}

  async execute(input: GetComplianceDashboardInput): Promise<ComplianceDashboardSnapshot> {
    const now = this.clock.now();

    const safe = async <T>(p: Promise<T>): Promise<T | Error> =>
      p.catch((err: unknown) => (err instanceof Error ? err : new Error(String(err))));

    const [lseSnap, cctSnap, docsSnap, missionsSnap, nlpdSnap] = await Promise.all([
      safe(this.lse.load(input.agencyId)),
      safe(this.cct.load(input.agencyId)),
      safe(this.workerDocs.load(input.agencyId, now)),
      safe(this.missions.load(input.agencyId, now)),
      safe(this.nlpd.load(input.agencyId)),
    ]);

    const indicators: ComplianceIndicator[] = [];

    indicators.push(
      lseSnap instanceof Error
        ? portUnavailable('lse_authorization', lseSnap, now)
        : buildLseIndicator({ snapshot: lseSnap, now }),
    );
    indicators.push(
      cctSnap instanceof Error
        ? portUnavailable('cct_rates', cctSnap, now)
        : buildCctIndicator({ snapshot: cctSnap, now }),
    );
    indicators.push(
      docsSnap instanceof Error
        ? portUnavailable('worker_documents', docsSnap, now)
        : buildWorkerDocsIndicator({ snapshot: docsSnap, now }),
    );
    indicators.push(
      missionsSnap instanceof Error
        ? portUnavailable('active_missions', missionsSnap, now)
        : buildActiveMissionsIndicator({ snapshot: missionsSnap, now }),
    );
    indicators.push(
      nlpdSnap instanceof Error
        ? portUnavailable('nlpd_registry', nlpdSnap, now)
        : buildNlpdIndicator({ snapshot: nlpdSnap, now }),
    );

    return {
      agencyId: input.agencyId,
      indicators,
      worstStatus: worstStatusOf(indicators),
      generatedAt: now,
    };
  }
}

function portUnavailable(
  domain: ComplianceIndicator['domain'],
  err: Error,
  now: Date,
): ComplianceIndicator {
  return {
    domain,
    status: 'critical',
    title: 'Données indisponibles',
    details: `Le service de chargement a échoué : ${err.message}`,
    lastCheckedAt: now,
  };
}
