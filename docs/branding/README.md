# Branding Helvètia Intérim — Kit de presse

> **Marque produit** : Helvètia Intérim
> **Éditeur** : `Helvètia Intérim SA` (filialisation en cours — voir ADR-0006 §4)
> **Fondateur / Direction** : Arnaud Guédou
> **Site** : https://helvetia-interim.guedou.ch (staging ET commercial)
> **Statut** : pilote opérationnel 2026-Q2, lancement commercial SaaS post-J+30.

Tous les assets (logo SVG, palette, typographies) vivent dans le package `packages/branding/` — cf. `packages/branding/src/`.

## Fichiers

- `palette.md` — couleurs hex + rôles + contraste WCAG.
- `description-court-fr.md` — 50 mots pour fiche annuaire, méta SEO, bio Twitter.
- `description-long-fr.md` — 150 mots pour communiqué presse, page entreprise, landing.
- `founder-bio-fr.md` — 80 mots bio LinkedIn du fondateur.
- `tagline.md` — tagline commerciale + sous-titre.
- Logos : voir `packages/branding/src/logo-full.svg`, `logo-mono.svg`, `icon.svg`.

## Usage

- Ces textes sont **les formes canoniques**. Toute communication externe (LinkedIn, emailing, presse) doit partir d'ici.
- Si besoin d'une traduction (DE, IT, EN) : ouvrir une PR dédiée, ne pas modifier ces fichiers en place (garder FR comme source de vérité, locales en copies).
- Si modification commerciale (pricing, positionnement) : validation fondateur requise + mise à jour `docs/01b-brief-saas-pivot.md`.

## PNG rasterisés (pour réseaux sociaux, favicons)

Pas encore générés automatiquement — à faire manuellement depuis les SVG :

```bash
# Exemple avec ImageMagick (à ajouter dans un prompt ops ultérieur)
convert -background none -density 300 packages/branding/src/icon.svg -resize 512x512 docs/branding/icon-512.png
convert -background none -density 300 packages/branding/src/icon.svg -resize 1024x1024 docs/branding/icon-1024.png
convert -background none -density 300 packages/branding/src/logo-full.svg -resize 1200x240 docs/branding/logo-full-1200.png
```

À wire dans un script `ops/branding/export-assets.sh` au moment où on en a vraiment besoin (signature LinkedIn, pitch deck, etc.). Pour MVP commercial : les SVG suffisent.
