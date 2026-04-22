import type { WorkerDocumentType } from './worker-document.js';

/**
 * Politique d'alerte d'expiration par type de document.
 * Les seuils sont en JOURS avant l'échéance ; le scan quotidien émet
 * une alerte quand `today + threshold >= expiresAt`.
 *
 * Sources : skills/compliance/work-permits/SKILL.md (permis), CLAUDE.md.
 */
export interface ExpiryThresholds {
  readonly thresholdDays: readonly number[];
}

const DEFAULT_THRESHOLDS: ExpiryThresholds = { thresholdDays: [60, 30, 7] };

const TYPE_THRESHOLDS: Readonly<Record<WorkerDocumentType, ExpiryThresholds>> = {
  // Permis L : court terme (max 1 an), surveillance rapprochée → 60 / 30 / 7 jours
  permit_work: { thresholdDays: [60, 30, 7] },
  // Permis de conduire CH (visite médicale C tous les 5 ans, B 70+ ans) → 90 / 60 / 30
  permit_driving: { thresholdDays: [90, 60, 30] },
  // Carte AVS : pas d'expiration formelle, mais on alerte à 90 jours si présent
  avs_card: { thresholdDays: [90] },
  // Attestation LAMal : annuelle → 60 / 30
  lamal_cert: { thresholdDays: [60, 30] },
  // Diplôme : pas d'expiration usuelle, fallback 90 jours
  diploma: { thresholdDays: [90] },
  // SUVA SST (sécurité chantier) : recyclage 4 ans → 60 / 30
  suva_sst: { thresholdDays: [60, 30] },
  // CACES (cariste/engin) : recyclage 5 ans → 90 / 60
  caces: { thresholdDays: [90, 60] },
  other: DEFAULT_THRESHOLDS,
};

/**
 * Renvoie le plus grand seuil franchi entre `now` et `expiresAt`.
 * Permet d'identifier l'alerte à émettre (60 / 30 / 7 jours).
 *
 * @returns nombre de jours du seuil franchi, ou `undefined` si aucun.
 */
export function nextCrossedThreshold(
  type: WorkerDocumentType,
  expiresAt: Date,
  now: Date,
): number | undefined {
  const daysRemaining = Math.ceil((expiresAt.getTime() - now.getTime()) / (24 * 3600 * 1000));
  if (daysRemaining < 0) return undefined; // expiré, géré ailleurs
  const thresholds = [...TYPE_THRESHOLDS[type].thresholdDays].sort((a, b) => a - b);
  // Le plus petit seuil >= daysRemaining (ex. 28 jours → premier seuil >= 28 = 30).
  for (const threshold of thresholds) {
    if (daysRemaining <= threshold) return threshold;
  }
  return undefined;
}

export function isExpired(expiresAt: Date | undefined, now: Date): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < now.getTime();
}

export function thresholdsFor(type: WorkerDocumentType): readonly number[] {
  return TYPE_THRESHOLDS[type].thresholdDays;
}

// Référencé pour conserver le fallback documenté.
void DEFAULT_THRESHOLDS;
