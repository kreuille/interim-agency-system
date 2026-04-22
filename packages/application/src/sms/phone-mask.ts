/**
 * Masquage des numéros pour les logs (cf. CLAUDE.md §3.4 :
 * "Aucune donnée personnelle en clair dans les logs.").
 *
 * Stratégie : conserve le préfixe pays + 2 premiers chiffres + 2
 * derniers, masque le reste avec `*`.
 *
 * Exemples :
 *   `+41791234567` → `+4179****567`
 *   `+33612345678` → `+3361******78`
 */
export function maskPhone(e164: string): string {
  if (!e164.startsWith('+')) return '****';
  const digits = e164.slice(1);
  if (digits.length <= 4) return `+${digits}`;
  const head = digits.slice(0, 4);
  const tail = digits.slice(-2);
  const stars = '*'.repeat(Math.max(2, digits.length - 6));
  return `+${head}${stars}${tail}`;
}
