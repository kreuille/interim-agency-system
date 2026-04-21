# OPS.weekly-review — Revue hebdomadaire de l'orchestrateur

> **Cadence** : hebdomadaire (vendredi 17:00 Europe/Zurich)
> **Effort** : S (30 min)
> **Skills** : `skills/ops/release-management/SKILL.md`, `skills/ops/sprint-planning/SKILL.md`

## Objectif
Revue de santé du projet : avancement, blockers, vélocité, dettes.

## Étapes
1. Lire `PROGRESS.md` et les entrées `SESSION-LOG.md` de la semaine.
2. Calculer vélocité : prompts `completed` cette semaine.
3. Vérifier : aucun prompt en `in_progress_paused` depuis > 7 jours.
4. Revue des blockers : tous actifs, pas de fantôme ; mitigations avancent ?
5. Compiler résumé : 1 page envoyée par email vendredi 17:30 au fondateur + lead tech.
6. Mise à jour métriques `PROGRESS.md §6`.
7. Archivage sessions > 30j dans `prompts/orchestrator/archive/YYYY-Www.md`.

## Email type
```
Semaine {N} — Projet Agence d'Intérim

✅ Prompts complétés : {N} ({IDs})
🟡 En cours : {N}
🔴 Blockers : {N}
📊 Vélocité cumulée : {x/semaine}
💡 Décision à prendre : {si applicable}

Détail : PROGRESS.md sur le repo
```

## DoD
- [ ] Résumé envoyé
- [ ] `PROGRESS.md` métriques à jour
- [ ] Archivage si besoin
- [ ] Next week préparé (sprint planning si début de sprint)
