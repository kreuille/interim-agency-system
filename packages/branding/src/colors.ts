/**
 * Palette Helvètia Intérim — SSOT des tokens de couleur.
 *
 * Les valeurs miroir exactement `tokens.css` (:root). Si tu modifies l'un,
 * modifie l'autre (duplication volontaire : CSS lit les variables, TS lit
 * ces constantes pour composants inline / Tailwind / @interim/landing
 * future).
 *
 * Principe : swiss precision — neutres pierre + accent rouge drapeau CH.
 * Choix arbitré par le fondateur (ADR-0006 §3 : rester sur l'identité
 * conçue dans PR #71).
 */

export const colors = {
  // Surfaces
  bg: '#f5f4f1',
  surface: '#ffffff',
  surface2: '#fafaf8',

  // Bordures
  border: '#e6e4df',
  borderStrong: '#d4d1ca',

  // Encre (texte)
  ink: '#1a1a1a',
  ink2: '#3a3a3a',
  ink3: '#6b6864',
  ink4: '#9a9690',

  // Accent (drapeau CH)
  accent: '#c8102e',
  accentSoft: '#fbeaed',
  accentInk: '#8f0b20',

  // États
  ok: '#157a4a',
  okSoft: '#e6f1ea',
  warn: '#b26a00',
  warnSoft: '#fbf0dc',
  info: '#1f4f8b',
  infoSoft: '#e6eef8',
  danger: '#dc2626',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Mapping utilitaire vers les noms de variables CSS `tokens.css` pour les
 * consommateurs qui ont besoin du nom `var(--xxx)` plutôt que de la
 * valeur hex directe (permet les overrides runtime white-label, cf. B3.1).
 */
export const cssVars: Record<ColorToken, string> = {
  bg: 'var(--bg)',
  surface: 'var(--surface)',
  surface2: 'var(--surface-2)',
  border: 'var(--border)',
  borderStrong: 'var(--border-strong)',
  ink: 'var(--ink)',
  ink2: 'var(--ink-2)',
  ink3: 'var(--ink-3)',
  ink4: 'var(--ink-4)',
  accent: 'var(--accent)',
  accentSoft: 'var(--accent-soft)',
  accentInk: 'var(--accent-ink)',
  ok: 'var(--ok)',
  okSoft: 'var(--ok-soft)',
  warn: 'var(--warn)',
  warnSoft: 'var(--warn-soft)',
  info: 'var(--info)',
  infoSoft: 'var(--info-soft)',
  danger: 'var(--accent)',
};
