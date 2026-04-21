# Skill — Revue de code

## Rôle
Tech lead / senior reviewer. Revue chaque PR avec exigence mais bienveillance.

## Quand l'utiliser
Chaque PR. Pas d'exception.

## Checklist du reviewer

### Correction
- [ ] Le code fait ce qu'annonce la PR (description correspond).
- [ ] DoD du prompt cochée dans la PR.
- [ ] Tests verts, couverture respectée.
- [ ] Pas de régression évidente (scénarios existants préservés).

### Qualité
- [ ] Architecture hexagonale respectée (pas d'imports infra → domaine).
- [ ] Types stricts, aucun `any`, aucun `as` non justifié.
- [ ] Fonctions ≤ 80 lignes, complexité ≤ 10.
- [ ] Noms explicites (`getUserById` pas `doStuff`).
- [ ] Pas de code commenté laissé traîner.
- [ ] Pas de TODO non qualifié (TODO sans ticket = rejet).

### Sécurité
- [ ] Aucun secret commité.
- [ ] Aucun log de PII non pseudonymisé.
- [ ] Validation d'entrée (Zod) aux bordures.
- [ ] Agency isolation respectée (tenant middleware, tests).

### Conformité
- [ ] Si touche paie : taux CCT vérifiés, majorations testées.
- [ ] Si touche data sensible : audit log écrit.
- [ ] Si touche MP API : idempotency key, circuit breaker, tests de contrat.

### Documentation
- [ ] README du module mis à jour si changement d'API publique.
- [ ] ADR si décision architecturale.
- [ ] Changelog / commit messages clairs.

## Ton de la revue

- **Bienveillant** : on corrige le code, pas la personne.
- **Concret** : "Ce nom ne dit pas ce que fait la fonction ; que penses-tu de `computeMonthlyPayslip` ?" plutôt que "nommage nul".
- **Priorisé** : distinguer `blocker`, `must`, `nit` (nitpick). Un nit n'est pas un blocker.
- **Rapide** : viser < 24h pour revue initiale, < 4h pour les boucles suivantes.

## Qui approuve quoi

| Changement | Reviewers requis |
|-----------|------------------|
| Feature standard | 1 dev senior |
| Changement architecture | 1 lead tech + 1 senior |
| Règle CCT / paie | 1 senior + 1 PO + 1 juriste (label compliance) |
| Secret / infra prod | 1 lead + 1 devops |
| Changement de contrat API MP | 1 lead + 1 contact MP (cross-team) |
| CLAUDE.md / PROMPTS.md | 1 lead + 1 PO (label rules-update) |

## Pièges courants
- LGTM sans lire → bugs en prod, perte de confiance.
- Revue trop longue / trop de nits bloquants → frustration dev, baisse de moral.
- Reviewer absent 3 jours → la PR pourrit. Reassign si pas dispo.
- Auto-approve son propre code → interdit, même pour un lead.

## Références
- `CLAUDE.md §2.5`
- Google eng practices : https://google.github.io/eng-practices/review/
