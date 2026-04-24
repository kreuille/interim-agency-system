# Palette Helvètia Intérim

Source de vérité : `packages/branding/src/colors.ts` + `tokens.css`.

## Tokens

| Rôle | Hex | Variable CSS | TS `colors.*` | Usage |
|---|---|---|---|---|
| **Accent** (rouge drapeau CH) | `#c8102e` | `--accent` | `accent` | CTA principal, éléments de marque, alertes P1 |
| Accent soft | `#fbeaed` | `--accent-soft` | `accentSoft` | Fond alerts accent, chips |
| Accent ink | `#8f0b20` | `--accent-ink` | `accentInk` | Hover/focus sur accent, texte sur soft |
| **Ink** (texte principal) | `#1a1a1a` | `--ink` | `ink` | H1-H3, chiffres clés |
| Ink 2 | `#3a3a3a` | `--ink-2` | `ink2` | Corps de texte |
| Ink 3 | `#6b6864` | `--ink-3` | `ink3` | Légendes, labels secondaires |
| Ink 4 | `#9a9690` | `--ink-4` | `ink4` | Placeholders, timestamps |
| **Surface** (blanc pur) | `#ffffff` | `--surface` | `surface` | Cards, modals, inputs |
| Surface 2 | `#fafaf8` | `--surface-2` | `surface2` | Nav, sidebar, alt rows |
| **Background** (pierre clair) | `#f5f4f1` | `--bg` | `bg` | Fond global, contraste avec surfaces |
| Border | `#e6e4df` | `--border` | `border` | Séparateurs |
| Border strong | `#d4d1ca` | `--border-strong` | `borderStrong` | Inputs, bordures visuelles actives |
| **Succès** | `#157a4a` | `--ok` | `ok` | Validations, badges "conforme", chip status available |
| Succès soft | `#e6f1ea` | `--ok-soft` | `okSoft` | Fond OK |
| **Warn** (ambre foncé) | `#b26a00` | `--warn` | `warn` | Alertes P2, expirations proches, partial status |
| Warn soft | `#fbf0dc` | `--warn-soft` | `warnSoft` | Fond warn |
| **Info** (bleu nuit) | `#1f4f8b` | `--info` | `info` | Alertes info, liens |
| Info soft | `#e6eef8` | `--info-soft` | `infoSoft` | Fond info |

## Contraste (WCAG 2.1)

Principales combinaisons à respecter (AA minimum 4.5:1 corps, 3:1 titres) :

| Combo | Ratio | Conforme AA |
|---|---|---|
| `ink` sur `bg` | 16.2:1 | ✅ AAA |
| `ink` sur `surface` | 17.4:1 | ✅ AAA |
| `ink-2` sur `surface` | 11.2:1 | ✅ AAA |
| `ink-3` sur `surface` | 5.7:1 | ✅ AA |
| `ink-4` sur `surface` | 3.4:1 | ⚠️ AA texte large/labels uniquement |
| Blanc sur `accent` (CTA) | 5.3:1 | ✅ AA |
| `accent-ink` sur `accent-soft` | 6.8:1 | ✅ AA |
| `ok` sur `ok-soft` | 4.9:1 | ✅ AA |
| `warn` sur `warn-soft` | 5.4:1 | ✅ AA |
| `info` sur `info-soft` | 6.7:1 | ✅ AA |

**Règle opérationnelle** : ne pas utiliser `ink-4` pour du corps de texte (<18px regular). Réservé aux labels, placeholders, timestamps.

## Notes

- Le rouge `#c8102e` est volontairement **plus sombre que le rouge drapeau CH officiel** (`#d52b1e`) pour améliorer le contraste avec le blanc des CTA. L'identité visuelle reste cohérente avec la CH, sans compromettre l'accessibilité.
- Neutres "pierre" (`#f5f4f1`, `#e6e4df`) plutôt que slate froid (`#f8fafc`, `#e2e8f0`) — choix stylistique pour une perception "artisanale suisse" vs "tech US".

## Références

- `packages/branding/src/tokens.css` — SSOT CSS.
- `packages/branding/src/colors.ts` — SSOT TypeScript.
- [Swiss Federal Chancellery brand guidelines](https://www.admin.ch/gov/en/start/federal-administration/visual-identity.html) — cohérence visuelle CH.
- [WebAIM contrast checker](https://webaim.org/resources/contrastchecker/) — vérifier avant tout ajout.
