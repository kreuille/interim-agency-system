# Skill — CCT Location de services

## Rôle
Juriste social spécialisé convention collective. Garantit que chaque contrat de mission, chaque fiche de paie, chaque facture respecte les minimaux de branche.

## Quand l'utiliser
Création de contrat, génération de bulletin, import annuel des barèmes, refus de taux sous minimum, calcul 13ᵉ salaire, vacances, jours fériés.

## Concepts clés
- **CCT Location de services** (Convention Collective de Travail) étendue par le Conseil fédéral depuis 2012, renouvelée périodiquement. **Force obligatoire** : s'applique à tous les employeurs/employés du secteur, qu'ils soient signataires ou non.
- **Branches** couvertes : construction, bâtiment second œuvre, commerce, logistique, déménagement, industrie, hôtellerie-restauration, etc. Chaque branche a ses **salaires minimaux** par qualification et par âge.
- Le salaire minimum CCT **prime** sur un salaire minimum cantonal inférieur (Genève/Neuchâtel/Tessin/Jura/Vaud ont un salaire minimum légal qui, s'il est supérieur à la CCT pour un cas donné, s'applique).
- **13ᵉ salaire** : 8.33% du brut, proratisé au nombre d'heures réellement travaillées.
- **Vacances** : 8.33% (25 j/an) < 50 ans ; 10.64% (≥ 50 ans et jeunes travailleurs < 20 ans).
- **Jours fériés** : payés, 8 jours fériés par an selon canton (+ 1er août fédéral).

## Règles dures
- Le système **refuse** la création d'un contrat de mission (et donc l'acceptation d'une proposition de mission) avec un taux horaire < minimum CCT de la branche pour la qualification.
- Le bulletin de salaire **expose** le 13ᵉ au prorata, les vacances au prorata, les jours fériés payés.
- Les **majorations** sont appliquées automatiquement selon la CCT et la LTr : heures sup +25% minimum (sauf compensation temps), nuit +25%, dimanche +50%, jours fériés +50% ou +100% selon branche.
- Les barèmes sont **annuels** et publiés par swissstaffing ; le système doit les importer et versionner (pas de hardcode).

## Données à tracer

Tables minimales :

```
cct_branches
  id, code, label_fr, label_de, applicable_from, applicable_to

cct_minimum_rates
  id, branch_id, qualification_code, age_bracket, canton_override NULL,
  rate_per_hour_rappen, valid_from, valid_to

cct_surcharge_rules
  id, branch_id, kind (night/sunday/holiday/overtime), percent,
  valid_from, valid_to
```

## Pratiques
- Un **job annuel** `OPS.cct-yearly-update` importe les nouveaux barèmes publiés par swissstaffing (typiquement T4 pour l'année suivante).
- Le **calcul paie** lit les barèmes en vigueur à la date d'exécution de la mission, pas à la date de génération.
- Le **contrat de mission** embarque une mention : « Le présent contrat est soumis à la CCT Location de services (étendue) — branche {X} », avec hyperlien vers la version applicable.
- Import test : cas de bord pour valider une majoration nuit + dimanche cumulée (certaines branches cumulent, d'autres non).

## Exemple de minimaux (à valider annuellement, illustratif)

| Branche | Qualification | < 20 ans (CHF/h brut, indicatif) | ≥ 20 ans (CHF/h brut, indicatif) |
|---------|---------------|----------------------------------|----------------------------------|
| Déménagement / logistique | Manœuvre | ~22–23 | ~24–26 |
| Déménagement / logistique | Déménageur qualifié | ~24–26 | ~28–30 |
| Déménagement / logistique | Chef d'équipe | — | ~30–33 |
| BTP gros œuvre | Manœuvre | ~24–26 | ~28–30 |
| BTP second œuvre | Ouvrier qualifié | — | ~32–36 |

**Important** : ces chiffres évoluent chaque année. Ne jamais les hardcoder. Le système lit `cct_minimum_rates` en vigueur.

## Pièges courants
- Appliquer les minimaux d'une branche à une autre (classification métier erronée). Le système doit forcer la qualification CCT officielle.
- Oublier le cumul nuit + dimanche pour les branches qui le permettent.
- Mettre à jour les barèmes au 1er janvier mais oublier que certaines missions commencées en décembre sont au taux ancien.
- Confondre 13ᵉ payé mensuellement (pas autorisé en CCT) vs en fin d'année (standard).

## Références
- CCT Location de services texte officiel : https://www.swissstaffing.ch
- Arrêté d'extension : www.fedlex.admin.ch (cherchant "CCT location de services")
- `docs/01-brief.md §3.2`
- `docs/02-partners-specification.md §2.1`
