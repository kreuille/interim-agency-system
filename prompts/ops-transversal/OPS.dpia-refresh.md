# OPS.dpia-refresh — Mise à jour DPIA nLPD

> **Cadence** : à la demande (nouveau traitement, nouveau sous-traitant, changement matériel)
> **Effort** : M (1 jour)
> **Skills** : `skills/compliance/nlpd-privacy/SKILL.md`

## Objectif
Maintenir la conformité nLPD en actualisant le registre des traitements et l'analyse d'impact (DPIA) lors de tout changement significatif.

## Déclencheurs
- Ajout d'un nouveau traitement (ex. analytics intérimaire).
- Nouveau sous-traitant (ex. migration SMS vers un autre fournisseur).
- Nouveau transfert hors Suisse (rare, à éviter).
- Nouvelle catégorie de données collectées.
- Changement de base légale.
- Incident de sécurité passé (retour d'expérience).

## Étapes
1. Documenter le changement dans `docs/compliance/registre-traitements.md`.
2. Revoir la DPIA : risque élevé ? Si oui, refaire l'analyse (probabilité × gravité × mesures).
3. Signer DPA avec nouveau sous-traitant si applicable.
4. Revoir la politique de confidentialité publique (portail intérimaire).
5. Information des personnes concernées si impact notable.
6. Re-consentement si base légale = consentement.

## DoD
- [ ] Registre mis à jour
- [ ] DPA signé si nouveau sous-traitant
- [ ] DPIA refaite si traitement à risque
- [ ] Info des personnes envoyée
- [ ] Entrée audit log

## Références
- `skills/compliance/nlpd-privacy/SKILL.md`, `docs/compliance/registre-traitements.md`
