# OPS.cct-yearly-update — MAJ barèmes CCT annuels

> **Cadence** : annuelle (T4 pour l'année N+1)
> **Effort** : M (1 jour)
> **Skills** : `skills/compliance/cct-staffing/SKILL.md`

## Objectif
Importer les nouveaux barèmes CCT Location de services publiés par swissstaffing, effectifs au 1er janvier.

## Étapes
1. Télécharger les barèmes officiels depuis https://www.swissstaffing.ch (ou via abonnement).
2. Vérifier le fichier (format, complétude toutes branches cibles).
3. Préparer fichier de migration `prisma/seeds/cct-rates-{year}.ts` avec `validFrom=YYYY-01-01`, `validTo=YYYY-12-31`.
4. **Clôturer** les anciens barèmes avec `validTo=prevYear-12-31`.
5. Exécuter en staging, vérifier via requêtes : taux 2026 != taux 2027.
6. Tests de régression : relancer 5 cas paie avec date 2026 → taux 2026 ; date 2027 → taux 2027.
7. Déployer en prod pendant période calme (dimanche).
8. Informer la gestionnaire paie des changements matériels.

## DoD
- [ ] Barèmes new year insérés, old year clôturés
- [ ] Tests régression verts
- [ ] Communication équipe paie
- [ ] Mise à jour `docs/compliance/cct-notes.md`

## Risques
- Oublier une branche → erreur de taux l'année entière.
- Barème rétroactif en cours d'année → re-paie rétroactive nécessaire.

## Références
- `skills/compliance/cct-staffing/SKILL.md`
