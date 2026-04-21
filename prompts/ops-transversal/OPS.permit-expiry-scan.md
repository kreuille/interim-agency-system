# OPS.permit-expiry-scan — Scan mensuel des permis

> **Cadence** : mensuelle (1er du mois)
> **Effort** : S (automatisé, revue 30 min)
> **Skills** : `skills/compliance/work-permits/SKILL.md`

## Objectif
Contrôle exhaustif des permis de travail à échoir dans les 90 jours. Anticiper les renouvellements, bloquer les missions illégales.

## Étapes
1. Lancer query : tous permis workers actifs WHERE `expiresAt ≤ today + 90d`.
2. Classer par urgence : J-30, J-60, J-90.
3. Vérifier que chaque cas a déjà été traité par A1.3 (alertes auto).
4. Pour les J-30 non résolus → action manuelle : contact intérimaire par gestionnaire, relance.
5. Revue cas particuliers : permis G hors zone, permis B expirés (sortie du territoire possible), permis L renouvelés exceptionnellement.
6. Rapport mensuel direction : N permis à gérer, N renouvelés OK, N cas critiques.

## DoD
- [ ] Tous les permis J-30 traités (contact ou décision)
- [ ] Aucun worker avec permis expiré encore en mission
- [ ] Rapport envoyé direction

## Références
- `skills/compliance/work-permits/SKILL.md`
