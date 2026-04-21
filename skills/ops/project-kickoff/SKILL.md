# Skill — Lancement de projet (kickoff)

## Rôle
Chef de projet / Scrum Master. Prépare le démarrage, aligne l'équipe, pose les rituels.

## Quand l'utiliser
Phase 0, sprint A.0, onboarding d'un nouveau membre, reset de projet qui dérive.

## Livrables d'un kickoff réussi
- **Charte projet** (objectifs, périmètre, non-objectifs, contraintes) — ici : `docs/01-brief.md` + `docs/03-plan-de-dev.md`.
- **Équipe** : rôles, responsabilités, RACI. Nommer un **DRI** (Directly Responsible Individual) pour chaque sprint.
- **Cadencement** : fréquence standup, durée sprint, démo, rétro.
- **Environnement** : repo, CI, canaux Slack/Teams, outils ticket (Linear/Jira).
- **Definition of Ready** + **Definition of Done** : accords explicites.
- **Risques** identifiés (`docs/06-risques.md`).

## Rituels proposés

| Rituel | Fréquence | Durée | Participants |
|--------|-----------|-------|--------------|
| Standup | Quotidien | 15 min | Devs + lead |
| Sprint planning | S0 sprint | 2h | Tout le monde |
| Démo sprint | S(fin) sprint | 1h | Devs + PO + fondateur |
| Rétro | S(fin) sprint | 1h | Devs + lead + PO |
| Revue hebdo orchestrateur | Vendredi 17h | 30 min | Lead + PO |
| Revue trimestrielle stratégique | Q | 2h | Fondateur + lead + PO |

## Definition of Ready (prompt prêt à exécuter)

- [ ] Objectif clair, 1 phrase
- [ ] Skills listées dans l'en-tête
- [ ] Dépendances (BlockedBy) complétées
- [ ] Definition of Done écrite (≥ 3 critères testables)
- [ ] Effort estimé (S/M/L/XL)
- [ ] Branche cible nommée

## Definition of Done (prompt complété)

- [ ] Tous les critères DoD cochés
- [ ] Typecheck + lint + tests verts
- [ ] Couverture ≥ seuil module
- [ ] Revue de code effectuée, commentaires résolus
- [ ] PR mergée dans `main`
- [ ] `PROGRESS.md` mis à jour
- [ ] `SESSION-LOG.md` clôturé avec livrables, décisions, dettes

## Pratiques
- Un **kickoff meeting** de 2h en S0 pour aligner tout le monde.
- **Tour de table** : chacun dit ce qu'il attend du projet, ce qui l'inquiète, ce qu'il est prêt à apporter.
- **Walking skeleton** visé dès A.0 : un `/health` en prod derrière HTTPS avec DB, Redis, auth mockée — la chaîne complète, sans feature.
- **Premier incident** provoqué volontairement (gameday) : simuler MP indisponible, voir comment l'équipe réagit.

## Pièges courants
- Kickoff trop court, sans temps pour les questions → équipe démotivée dès J1.
- RACI flou → chacun pense que l'autre s'occupe des choix bloquants.
- Rituels imposés sans explication → perçus comme overhead, sautés au bout de 2 semaines.
- DoD absente ou théorique → features "finies" mais cassées.

## Références
- `docs/03-plan-de-dev.md §9`
- `skills/ops/sprint-planning/SKILL.md`
- Scrum Guide : https://scrumguides.org
