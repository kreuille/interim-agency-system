import type { ComplianceIndicator } from './compliance-indicator.js';

/**
 * Builders pure pour les 5 indicateurs du dashboard A6.1.
 * Chaque fonction prend un snapshot d'état (computed by application
 * use case via repos) et produit un `ComplianceIndicator` immutable.
 *
 * Seuils utilisés :
 *   - LSE expire dans < 30j → warning ; expirée → critical
 *   - CCT barème > 13 mois sans MAJ → warning ; > 24 mois → critical
 *   - Worker docs : < 95% valides → warning ; < 80% → critical
 *   - Missions actives > limite LTr → critical ; sinon ok
 *   - nLPD : registre + DPIA présents → ok ; sinon warning/critical
 */

const DAY_MS = 86400_000;

// ============== LSE ===============================================

export interface LseSnapshot {
  readonly authorization: 'cantonal' | 'federal' | 'both' | 'none';
  readonly expiresAt: Date | null;
}

export function buildLseIndicator(input: {
  readonly snapshot: LseSnapshot;
  readonly now: Date;
}): ComplianceIndicator {
  const s = input.snapshot;
  if (s.authorization === 'none') {
    return {
      domain: 'lse_authorization',
      status: 'critical',
      title: 'Autorisation LSE manquante',
      details: 'Aucune autorisation cantonale ni fédérale enregistrée.',
      cta: { label: 'Déposer demande LSE', targetPath: '/dashboard/compliance/lse/request' },
      lastCheckedAt: input.now,
    };
  }
  if (!s.expiresAt) {
    return {
      domain: 'lse_authorization',
      status: 'warning',
      title: "Autorisation LSE sans date d'expiration",
      details: `Type : ${s.authorization}. Configurer la date d'expiration.`,
      cta: {
        label: "Configurer l'expiration",
        targetPath: '/dashboard/compliance/lse/edit',
      },
      lastCheckedAt: input.now,
    };
  }
  const daysToExpiry = Math.floor((s.expiresAt.getTime() - input.now.getTime()) / DAY_MS);
  if (daysToExpiry < 0) {
    return {
      domain: 'lse_authorization',
      status: 'critical',
      title: 'Autorisation LSE expirée',
      details: `Expirée depuis ${String(Math.abs(daysToExpiry))} jour(s). Activité illégale (LSE art. 12).`,
      cta: { label: 'Renouveler immédiatement', targetPath: '/dashboard/compliance/lse/renew' },
      lastCheckedAt: input.now,
    };
  }
  if (daysToExpiry < 30) {
    return {
      domain: 'lse_authorization',
      status: 'warning',
      title: `Autorisation LSE expire dans ${String(daysToExpiry)} jour(s)`,
      details: `Type : ${s.authorization}. Anticiper le renouvellement (délai SECO ~3 mois).`,
      cta: { label: 'Préparer renouvellement', targetPath: '/dashboard/compliance/lse/renew' },
      metric: `Expire le ${s.expiresAt.toISOString().slice(0, 10)}`,
      lastCheckedAt: input.now,
    };
  }
  return {
    domain: 'lse_authorization',
    status: 'ok',
    title: 'Autorisation LSE valide',
    details: `Type : ${s.authorization}. Expire le ${s.expiresAt.toISOString().slice(0, 10)}.`,
    metric: `${String(daysToExpiry)} jours restants`,
    lastCheckedAt: input.now,
  };
}

// ============== CCT ===============================================

export interface CctSnapshot {
  readonly lastUpdatedAt: Date | null;
  readonly numberOfBranchesConfigured: number;
}

export function buildCctIndicator(input: {
  readonly snapshot: CctSnapshot;
  readonly now: Date;
}): ComplianceIndicator {
  const s = input.snapshot;
  if (!s.lastUpdatedAt) {
    return {
      domain: 'cct_rates',
      status: 'critical',
      title: 'Barèmes CCT non configurés',
      details: 'Aucune table de taux minimum CCT chargée.',
      cta: { label: 'Importer barèmes 2026', targetPath: '/dashboard/compliance/cct/import' },
      lastCheckedAt: input.now,
    };
  }
  const monthsSinceUpdate = (input.now.getTime() - s.lastUpdatedAt.getTime()) / (30 * DAY_MS);
  if (monthsSinceUpdate > 24) {
    return {
      domain: 'cct_rates',
      status: 'critical',
      title: 'Barèmes CCT obsolètes (> 24 mois)',
      details: `Dernière MAJ : ${s.lastUpdatedAt.toISOString().slice(0, 10)}. Risque de salaires sous minimum.`,
      cta: { label: 'Mettre à jour', targetPath: '/dashboard/compliance/cct/import' },
      metric: `${String(s.numberOfBranchesConfigured)} branches configurées`,
      lastCheckedAt: input.now,
    };
  }
  if (monthsSinceUpdate > 13) {
    return {
      domain: 'cct_rates',
      status: 'warning',
      title: 'Barèmes CCT à vérifier (> 13 mois)',
      details: `Dernière MAJ : ${s.lastUpdatedAt.toISOString().slice(0, 10)}. Vérifier publication Swissstaffing.`,
      cta: { label: 'Vérifier MAJ', targetPath: '/dashboard/compliance/cct' },
      lastCheckedAt: input.now,
    };
  }
  return {
    domain: 'cct_rates',
    status: 'ok',
    title: 'Barèmes CCT à jour',
    details: `Dernière MAJ : ${s.lastUpdatedAt.toISOString().slice(0, 10)}.`,
    metric: `${String(s.numberOfBranchesConfigured)} branches`,
    lastCheckedAt: input.now,
  };
}

// ============== Worker documents ==================================

export interface WorkerDocsSnapshot {
  readonly totalWorkers: number;
  readonly workersWithAllDocsValid: number;
  readonly upcomingExpirations60Days: number;
}

export function buildWorkerDocsIndicator(input: {
  readonly snapshot: WorkerDocsSnapshot;
  readonly now: Date;
}): ComplianceIndicator {
  const s = input.snapshot;
  if (s.totalWorkers === 0) {
    return {
      domain: 'worker_documents',
      status: 'ok',
      title: 'Aucun worker enregistré',
      lastCheckedAt: input.now,
    };
  }
  const validRatio = s.workersWithAllDocsValid / s.totalWorkers;
  const validPct = Math.round(validRatio * 100);
  if (validRatio < 0.8) {
    return {
      domain: 'worker_documents',
      status: 'critical',
      title: `Documents workers : ${String(validPct)}% valides (< 80%)`,
      details: `${String(s.workersWithAllDocsValid)} / ${String(s.totalWorkers)} workers complets. ${String(s.upcomingExpirations60Days)} expirations < 60j.`,
      cta: { label: 'Voir liste', targetPath: '/dashboard/workers?filter=incomplete' },
      metric: `${String(validPct)}%`,
      lastCheckedAt: input.now,
    };
  }
  if (validRatio < 0.95 || s.upcomingExpirations60Days > 5) {
    return {
      domain: 'worker_documents',
      status: 'warning',
      title: `Documents workers : ${String(validPct)}% valides`,
      details: `${String(s.workersWithAllDocsValid)} / ${String(s.totalWorkers)} workers complets. ${String(s.upcomingExpirations60Days)} expirations < 60j.`,
      cta: { label: 'Voir expirations', targetPath: '/dashboard/workers?filter=expiring' },
      metric: `${String(validPct)}%`,
      lastCheckedAt: input.now,
    };
  }
  return {
    domain: 'worker_documents',
    status: 'ok',
    title: `Documents workers : ${String(validPct)}% valides`,
    details: `${String(s.workersWithAllDocsValid)} / ${String(s.totalWorkers)} workers complets.`,
    metric: `${String(validPct)}%`,
    lastCheckedAt: input.now,
  };
}

// ============== Active missions ===================================

export interface ActiveMissionsSnapshot {
  readonly count: number;
  readonly workersOverWeeklyLimit: number;
}

export function buildActiveMissionsIndicator(input: {
  readonly snapshot: ActiveMissionsSnapshot;
  readonly now: Date;
}): ComplianceIndicator {
  const s = input.snapshot;
  if (s.workersOverWeeklyLimit > 0) {
    return {
      domain: 'active_missions',
      status: 'critical',
      title: `${String(s.workersOverWeeklyLimit)} worker(s) au-delà de 50h/sem (LTr)`,
      details: 'Dépassement légal LTr art. 9. Action immédiate requise (rééquilibrage missions).',
      cta: {
        label: 'Voir workers concernés',
        targetPath: '/dashboard/workers?filter=overweekly',
      },
      metric: `${String(s.count)} missions actives`,
      lastCheckedAt: input.now,
    };
  }
  return {
    domain: 'active_missions',
    status: 'ok',
    title: `${String(s.count)} missions actives`,
    details: 'Aucun dépassement LTr détecté.',
    metric: String(s.count),
    lastCheckedAt: input.now,
  };
}

// ============== nLPD registry =====================================

export interface NlpdSnapshot {
  readonly registryUpToDate: boolean;
  readonly dpiaPresent: boolean;
  readonly lastDataPersonRequestPending: number;
}

export function buildNlpdIndicator(input: {
  readonly snapshot: NlpdSnapshot;
  readonly now: Date;
}): ComplianceIndicator {
  const s = input.snapshot;
  if (!s.registryUpToDate) {
    return {
      domain: 'nlpd_registry',
      status: 'critical',
      title: 'Registre nLPD non à jour',
      details: 'Article 12 nLPD : registre des activités obligatoire.',
      cta: { label: 'Mettre à jour', targetPath: '/dashboard/compliance/nlpd/registry' },
      lastCheckedAt: input.now,
    };
  }
  if (!s.dpiaPresent) {
    return {
      domain: 'nlpd_registry',
      status: 'warning',
      title: 'DPIA manquante (analyse impact)',
      details: 'Recommandée pour traitement à risque (intérimaires + données sensibles).',
      cta: { label: 'Démarrer DPIA', targetPath: '/dashboard/compliance/nlpd/dpia' },
      lastCheckedAt: input.now,
    };
  }
  if (s.lastDataPersonRequestPending > 0) {
    return {
      domain: 'nlpd_registry',
      status: 'warning',
      title: `${String(s.lastDataPersonRequestPending)} demande(s) droits personnes en attente`,
      details: 'Délai légal : 30 jours (art. 25 nLPD).',
      cta: { label: 'Traiter demandes', targetPath: '/dashboard/compliance/nlpd/requests' },
      lastCheckedAt: input.now,
    };
  }
  return {
    domain: 'nlpd_registry',
    status: 'ok',
    title: 'Conformité nLPD',
    details: 'Registre + DPIA présents. Aucune demande en attente.',
    lastCheckedAt: input.now,
  };
}
