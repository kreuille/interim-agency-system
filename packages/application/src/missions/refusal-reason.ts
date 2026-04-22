/**
 * Motifs structurés de refus par l'agence ou par l'intérimaire.
 * Liste fermée pour permettre des stats agrégées + dashboards
 * (refus dominants par client/canton/CCT).
 *
 * - `unavailable`         : intérimaire pas dispo (vacances, autre mission)
 * - `not_qualified`       : permis/skills manquants pour le poste
 * - `distance_too_far`    : trajet > seuil agence (config par client)
 * - `cct_below_minimum`   : taux client < CCT cantonal applicable
 * - `worker_declined`     : refus explicite intérimaire (raison libre dans `freeform`)
 * - `client_changed_mind` : client a annulé / modifié les besoins
 * - `other`               : champ libre `freeform`
 */
export const REFUSAL_REASONS = [
  'unavailable',
  'not_qualified',
  'distance_too_far',
  'cct_below_minimum',
  'worker_declined',
  'client_changed_mind',
  'other',
] as const;

export type RefusalReasonKind = (typeof REFUSAL_REASONS)[number];

export interface RefusalReason {
  readonly kind: RefusalReasonKind;
  /** Texte libre additionnel (max 500 chars) — requis si kind=`other`. */
  readonly freeform?: string;
}

export function formatRefusalReason(reason: RefusalReason): string {
  if (reason.freeform) return `${reason.kind}: ${reason.freeform}`;
  return reason.kind;
}
