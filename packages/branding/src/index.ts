/**
 * `@interim/branding` — Design system Helvètia Intérim.
 *
 * Ce package est la source de vérité (SSOT) pour :
 *  - Couleurs   → `colors.ts`
 *  - Typography → `typography.ts`
 *  - Tokens CSS → `tokens.css` (import dans le layout Next)
 *  - Fonts      → `fonts.css` (self-hosted via @fontsource, nLPD-safe)
 *  - Logos SVG  → `logo-full.svg` | `logo-mono.svg` | `icon.svg`
 *
 * Usage depuis une app Next.js :
 * ```tsx
 * // app/layout.tsx
 * import '@interim/branding/fonts.css';
 * import '@interim/branding/tokens.css';
 * import './globals.css'; // primitives + utilitaires locaux uniquement
 * ```
 *
 * Pour les SVG :
 * ```tsx
 * import iconUrl from '@interim/branding/icon.svg';
 * <Image src={iconUrl} alt="Helvètia Intérim" />
 * ```
 *
 * Référence : `docs/adr/0006-saas-pivot.md` (décision marque + palette).
 */

export * from './colors.js';
export * from './typography.js';
