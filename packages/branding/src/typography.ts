/**
 * Typography stack Helvètia Intérim.
 *
 * Les fonts sont self-hostées via `@fontsource/*` (cf. `fonts.css`) pour
 * conformité nLPD — **pas** de Google Fonts en direct (leak IP client
 * vers Google).
 *
 * - UI + corps : Inter (400/500/600/700)
 * - Chiffres / code : JetBrains Mono (400/500) — pour les montants CHF,
 *   IBAN, AVS, codes référence où l'alignement tabulaire compte.
 */

/** Font stack UI + corps de texte. */
export const fontSans =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

/** Font stack mono — chiffres tabulaires, IBAN, références. */
export const fontMono = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * Features OpenType activées par défaut sur le corps de texte — `cv11`
 * (1 sans barre), `ss01` (a simplifié), `ss03` (g simplifié) améliorent
 * la lisibilité pour les données numériques suisses.
 */
export const fontFeatures = "'cv11', 'ss01', 'ss03'";

/** Échelle typographique — aligne sur les usages globals.css existants. */
export const fontSize = {
  xs: '10.5px',
  sm: '11.5px',
  base: '12.5px',
  body: '13px',
  lg: '15px',
  xl: '18px',
  '2xl': '22px',
  '3xl': '28px',
  '4xl': '36px',
} as const;

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export type FontSizeToken = keyof typeof fontSize;
export type FontWeightToken = keyof typeof fontWeight;
