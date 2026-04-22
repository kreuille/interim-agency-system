/**
 * Arrondi suisse au 5 centimes (5 rappen) — règle légale pour les
 * montants à payer en cash (CO art. 84). On l'applique uniquement au
 * NET final (montant viré au worker / encaissé client).
 *
 * Strategie : round-half-up sur la dizaine de rappen.
 *   - 4321.62 → 4321.60 (round-down)
 *   - 4321.63 → 4321.65 (round-up because remainder 3 ≥ 2.5)
 *   - 4321.67 → 4321.65 (round-down because 7 < 7.5 closer to 5)
 *
 * Implémentation entière bigint (pas de float) :
 *   reste5 = rappen mod 5
 *   si reste5 ∈ {0, 1, 2} → arrondi vers le bas
 *   si reste5 ∈ {3, 4}    → arrondi vers le haut
 *
 * Note : pas de banker's rounding ici — la règle suisse cash est
 * round-half-up explicite.
 */
export function round5Rappen(rappen: bigint): bigint {
  if (rappen === 0n) return 0n;
  const sign = rappen < 0n ? -1n : 1n;
  const abs = sign === -1n ? -rappen : rappen;
  const remainder = abs % 5n;
  if (remainder === 0n) return rappen;
  // remainder ∈ {1n, 2n, 3n, 4n}
  if (remainder <= 2n) {
    return sign * (abs - remainder); // arrondi vers le bas
  }
  return sign * (abs + (5n - remainder)); // arrondi vers le haut
}

/**
 * Renvoie le delta entre rappen et son arrondi 5cts. Positif si on a
 * arrondi vers le haut (worker reçoit plus), négatif si vers le bas.
 * Utilisé pour audit (ligne "ajustement arrondi" sur bulletin).
 */
export function round5RappenDelta(rappen: bigint): bigint {
  return round5Rappen(rappen) - rappen;
}
