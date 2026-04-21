# Skill — Paie hebdomadaire agence d'intérim

## Rôle
Gestionnaire paie certifié. Applique CCT + LTr + assurances sociales. Livre le bulletin et déclenche les virements le vendredi.

## Quand l'utiliser
Moteur de paie, bulletin, ELM, pain.001, export compta, changement de barème, clôture mensuelle.

## Concepts clés
- **Paie hebdo** (pratique standard intérim CH) — le vendredi pour la semaine écoulée (lun → dim).
- **Timesheet signé** = input de la paie. Sans signature, validation tacite à J+7 puis paie.
- **Base de calcul** : heures × taux CCT branche × (1 + majorations applicables).
- **Compléments** : 13ᵉ 8.33%, vacances 8.33% ou 10.64%, jours fériés payés prorata.
- **Déductions** : AVS/AI/APG + AC + LAA non-pro + LPP (si seuil) + IS (permis L/B/G).
- **Net à payer** = brut + compléments − déductions.
- **Arrondi** : 5 centimes sur net à payer (règle suisse).

## Workflow paie standard

```
Vendredi 17:00 — cut-off timesheets semaine écoulée
Vendredi 18:00 — batch calcul paie
  ├─ agrégation timesheet par intérimaire
  ├─ calcul heures normales + majorations
  ├─ compléments 13e / vacances / fériés
  ├─ déductions AVS / AC / LAA / LPP / IS
  ├─ arrondi net 5 cts
  └─ génération bulletin PDF
Vendredi 19:00 — export pain.001 ISO 20022 → PostFinance/UBS
Vendredi 19:30 — annonce ELM Swissdec (différé possible fin mois)
Vendredi 20:00 — diffusion bulletins aux intérimaires (portail + email)
Lundi matin — intérimaires voient l'argent sur leur compte
```

## Règles dures
- Base brute inclut TOUS les éléments CCT (heures × taux, majorations, compléments). Pas d'astuce pour réduire la base AVS.
- Si seuil LPP franchi en cours d'année par cumul, affiliation rétroactive — traitement de régularisation mensuel.
- IS appliqué au barème du canton de **domicile**, pas de travail. Exception : permis G → canton de travail.
- Bulletin doit mentionner : période, nom, AVS, IDE agence, poste, heures détaillées, brut, déductions ligne à ligne, net à payer, IBAN.

## Formule simplifiée (illustrative)

```
brut_heures_normales = heures_normales × taux_cct
majorations = Σ (heures_majorées × taux_cct × pourcentage_majoration)
brut_base = brut_heures_normales + majorations
compléments = brut_base × (8.33% [13e] + 8.33%_ou_10.64% [vac]) + jours_fériés_payés
brut_total = brut_base + compléments

avs_ai_apg = brut_total × taux_salarié
ac = min(brut_total, plafond) × 1.1% + max(0, brut_total - plafond) × 0.5%
laa_np = brut_total × taux_laa_np
lpp = calcul selon règlement caisse si seuil franchi
is = table(canton_domicile, statut_marital, brut_total)
net_à_payer = arrondi_5cts(brut_total - avs - ac - laa_np - lpp - is)
```

## Pratiques
- **Toujours** conserver la trace des taux et barèmes utilisés dans le bulletin (champ `computation_context` en JSON) — essentiel pour reproduire un bulletin 5 ans plus tard.
- **Clôture** mensuelle : réconciliation bulletin / ELM / pain.001 / écriture comptable. Automatique, avec alerte si écart.
- **Changement de barème** en cours d'année : import le jour même, application aux paies suivantes. Une re-paie rétroactive peut être déclenchée si erreur détectée (corrigendum).
- **Bulletin PDF** : format lisible FR, éventuellement DE pour agences bilingues. En-tête agence + IDE + adresse.

## Pièges courants
- Paie en CHF flottant → erreur d'arrondi cumulée. Toujours en Rappen (integer).
- Appliquer 13ᵉ ou vacances sur la base AVS par oubli → fausse la base. Vacances et 13ᵉ font partie de la base AVS normalement.
- Oublier l'impôt à la source pour un nouveau permis B embauché en cours de mois.
- Ne pas déclencher LPP quand seuil franchi → contrôle caisse = régul rétroactive + intérêts.
- Bulletin sans mention du coefficient employeur (pas obligatoire mais utile pour l'intérimaire).

## Références
- `docs/01-brief.md §4.7`
- `skills/compliance/cct-staffing/SKILL.md`
- `skills/compliance/social-insurance/SKILL.md`
- `skills/compliance/ltr-working-time/SKILL.md`
- Swissdec Recommandation 5.0
