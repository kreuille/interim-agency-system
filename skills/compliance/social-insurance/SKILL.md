# Skill — Assurances sociales (AVS/AI/APG, AC, LAA, LPP, IS)

## Rôle
Gestionnaire paie + juriste social. Applique correctement les retenues, cotisations patronales, et les annonces aux caisses.

## Quand l'utiliser
Calcul d'un bulletin, annonce ELM, intégration Swissdec, import barèmes annuels, changement d'assureur LAA, affiliation LPP.

## Concepts clés
- **AVS / AI / APG** (1er pilier) : obligatoire dès le 1er CHF du salaire (sauf jeunes < 18 ans, franchise limitée). Taux salarié ~5.3% + employeur ~5.3% (chiffres indicatifs 2026).
- **AC** (assurance chômage) : taux salarié ~1.1% jusqu'à plafond + 0.5% au-delà ; employeur idem.
- **LAA** (loi sur l'assurance-accidents, SUVA ou privé) : professionnel (LAAP) à charge employeur ; non-professionnel (LAANP) à charge employé (~1–2%).
- **LPP** (prévoyance professionnelle, 2e pilier) : dès seuil d'entrée **22'050 CHF/an en 2026** (21'510 en 2025 — vérifier chaque année). Cotisations variables selon règlement caisse.
- **Impôt à la source (IS)** : obligatoire pour permis L, B, G (et C marié à conjoint non-permis C). Prélevé par l'agence, reversé mensuellement au canton. **Barèmes cantonaux** spécifiques.

## Règles dures
- La retenue AVS/AC/LAA est appliquée **à chaque paie** (hebdo dans notre cas), pas seulement en fin de mois.
- La LPP est appliquée dès que le cumul annuel franchit le seuil (extrapolation en intérim : méthode du taux d'occupation et du pro rata).
- L'IS utilise le **barème du canton de domicile** de l'intérimaire (pas du canton du travail), sauf cas frontalier (permis G → canton de travail + accord fiscal).
- Annonce **Swissdec ELM** aux caisses compétentes (AVS, AC, LAA, LPP) chaque mois / trimestre selon configuration.

## Tableau taux indicatifs (2026, **à vérifier et versionner annuellement**)

| Cotisation | Salarié | Employeur | Total |
|-----------|---------|-----------|-------|
| AVS/AI/APG | 5.30% | 5.30% | 10.60% |
| AC | 1.10% (jusqu'à plafond 148'200) | 1.10% | 2.20% |
| AC haut revenu | 0.50% | 0.50% | 1.00% |
| LAA pro | 0% | variable (SUVA ~1.5–3%) | — |
| LAA non pro | ~1–2% | 0% | — |
| LPP | variable 7–18% partagé selon règlement | | — |

**Rappel** : ces chiffres évoluent. Un fichier JSON `config/social-rates-2026.json` versionné les porte et un test de non-régression vérifie.

## Pratiques
- Calcul de la base AVS/AC : brut incluant 13ᵉ, vacances, majorations. Exclure les notes de frais remboursées et les cadeaux < 500 CHF/an.
- IS : identifier le **canton de domicile** (champ `TempWorker.residence_canton`) et charger le barème correspondant.
- ELM : utiliser un adapter certifié Swissdec (via Bexio, Abacus, ou un service tiers comme "uelohn" ou "Swissdec-Connector"). Ne pas réimplémenter.
- LPP : contractualiser avec une caisse (ex. Swiss Life, Axa, Helvetia, Swisscanto). L'agence est **l'affilieur**, les intérimaires sont les assurés pendant les missions dépassant le seuil.

## Pièges courants
- Confondre canton de travail et canton de domicile pour l'IS.
- Appliquer IS aux permis C par réflexe (non, sauf cas marital).
- Oublier d'affilier à la LPP quand un intérimaire dépasse le seuil en cours d'année par cumul — contrôle annuel indispensable.
- Appliquer LAA non-pro à un intérimaire qui travaille < 8h/sem moyennes (seuil LAA non-pro).
- Réimplémenter ELM au lieu d'utiliser un adapter certifié (non reconnu par les caisses).

## Références
- AVS : https://www.ahv-iv.ch
- Swissdec ELM : https://www.swissdec.ch
- SUVA : https://www.suva.ch
- Barèmes IS cantonaux : https://www.estv.admin.ch
- `docs/01-brief.md §3.4`
