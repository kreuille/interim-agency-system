/**
 * Indicateurs du dashboard conformité (A6.1).
 *
 * Chaque domaine de compliance produit un `ComplianceIndicator` avec :
 *   - status : `ok` (🟢) / `warning` (🟠) / `critical` (🔴)
 *   - title FR human-readable
 *   - details (optionnel) : ligne descriptive sous le titre
 *   - metric (optionnel) : valeur chiffrée (ex. "73 / 80 docs valides")
 *   - cta (optionnel) : action proposée si pas ok (label + targetPath)
 *   - lastCheckedAt : horodatage du calcul
 *
 * Les indicateurs sont pure value objects — pas d'effet de bord, pas
 * de timer interne. Le calcul est fait par les builders qui prennent
 * un état "snapshot" en input.
 */

export const COMPLIANCE_STATUSES = ['ok', 'warning', 'critical'] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export const COMPLIANCE_DOMAINS = [
  'lse_authorization',
  'cct_rates',
  'worker_documents',
  'active_missions',
  'nlpd_registry',
] as const;
export type ComplianceDomain = (typeof COMPLIANCE_DOMAINS)[number];

export interface ComplianceCta {
  readonly label: string;
  readonly targetPath: string;
}

export interface ComplianceIndicator {
  readonly domain: ComplianceDomain;
  readonly status: ComplianceStatus;
  readonly title: string;
  readonly details?: string;
  readonly metric?: string;
  readonly cta?: ComplianceCta;
  readonly lastCheckedAt: Date;
}

export interface ComplianceDashboardSnapshot {
  readonly agencyId: string;
  readonly indicators: readonly ComplianceIndicator[];
  readonly worstStatus: ComplianceStatus;
  readonly generatedAt: Date;
}

/**
 * Renvoie le pire statut parmi un ensemble (critical > warning > ok).
 * Utile pour fixer le statut global du dashboard.
 */
export function worstStatusOf(indicators: readonly ComplianceIndicator[]): ComplianceStatus {
  if (indicators.some((i) => i.status === 'critical')) return 'critical';
  if (indicators.some((i) => i.status === 'warning')) return 'warning';
  return 'ok';
}
