# Skill — Planification de sprint

## Rôle
PO + Scrum Master. Prépare le sprint, organise la planification, anime la démo et la rétro.

## Quand l'utiliser
Avant chaque sprint, pendant, et en clôture.

## Avant le sprint (1–2 j avant S0)
- Vérifier que le backlog priorisé contient ≥ N prompts "Ready" (N = capacité sprint).
- Mettre à jour `PROGRESS.md` avec la vélocité de la semaine précédente.
- Préparer la démo du sprint précédent si pas faite.
- Rappeler aux devs : le DoR (Definition of Ready) sur chaque prompt.

## Sprint planning (S0 sprint, 2h max)
1. **Rappel des objectifs du sprint** (10 min) : 1–2 phrases max, ce que le fondateur doit voir à la démo.
2. **Revue backlog** (30 min) : parcourir les prompts candidats, clarifier périmètre si besoin.
3. **Capacity check** (15 min) : combien de j-h dispo par dev, vacances, autres engagements.
4. **Engagement** (45 min) : sélection finale des prompts à embarquer, répartition, buffer imprévus (~20%).
5. **Risques** (15 min) : identifier ce qui pourrait faire dériver, plan B.
6. **Clôture** (5 min) : rappel démo (date) et rétro.

## Pendant le sprint
- **Standup** 15 min / jour : Hier / Aujourd'hui / Blockers. Pas de détail technique (renvoi en break-out).
- **Blocker ouvert 2 jours** = escalade lead tech.
- **Mise à jour `PROGRESS.md`** à chaque fin de prompt, pas en bloc.
- Si un prompt dépasse 2x son estimation → re-planning ou scindage.

## Démo (S(fin) sprint, 1h)
- **Live** : pas de vidéo enregistrée. Le dev qui a fait la feature montre, répond aux questions du fondateur.
- **Sur données réalistes** : seeds représentatives, pas juste "Jean Dupont test".
- **Non-fini = pas montré**. Mieux vaut 3 features finies que 8 en WIP.

## Rétro (S(fin) sprint, 1h)
Format "Start / Stop / Continue" ou "Mad / Sad / Glad", peu importe. Ce qui compte :
- **3 actions concrètes** sorties avec DRI et ETA.
- **1 win** à célébrer.
- **Psychological safety** : ne rien reprocher publiquement à un dev, rester sur les faits.

## Checklist vélocité

| Métrique | Observer | Action si hors cible |
|----------|----------|---------------------|
| Prompts completed / semaine | Viser 4–6 | < 3 : investiguer blockers, rééquilibrer charges |
| Ratio prompts embarqués vs complétés | > 80% | < 70% : sur-commitment, réduire sprint suivant |
| Blockers résolus / ouverts | > 1 | < 1 : blockers s'accumulent, daily escalation |
| Rétention DoD (no bug regression) | 100% | < 100% : revoir tests de non-régression |

## Pièges courants
- Embarquer le sprint "plein" sans buffer — tout imprévu fait tout glisser.
- Ne pas faire la rétro (overhead perçu) — les mêmes problèmes reviennent sprint après sprint.
- Démo enregistrée en video au lieu de live — le fondateur ne pose pas ses vraies questions.
- PO qui change la priorité en cours de sprint sans prévenir.

## Références
- `prompts/orchestrator/ORCHESTRATOR.md §8`
- `docs/03-plan-de-dev.md §3`
