# RESUME-TEMPLATE.md — Gabarit de résumé de reprise

> À utiliser **uniquement** quand une session Claude approche de la saturation de contexte ou doit être interrompue avant la fin d'un prompt.
> Coller ce gabarit rempli dans `SESSION-LOG.md` sous l'entrée de session en cours, dans une section `### État figé pour reprise`.

---

## Gabarit (à copier)

```markdown
### État figé pour reprise — {YYYY-MM-DD HH:mm}

#### Prompt en cours
- **ID** : {ex. A2.5-availability-push-queue}
- **Branche Git** : feat/{ID}-{slug}
- **Dernier commit** : {hash court} — "{message}"
- **Statut** : in_progress_paused — motif : {contexte saturé | interruption user | blocage technique}

#### Ce qui est FAIT
- [x] {étape 1 concrète avec chemin de fichier}
- [x] {étape 2}
- [x] {étape 3}

#### Ce qui est EN COURS (incomplet)
- [~] {étape X} — fait à {N}%. Concrètement : {description précise de l'état partiel}
  - Fichier : `{chemin}` — ligne {NNN} environ
  - Reste à faire : {actions précises}

#### Ce qui reste à faire pour CLORE ce prompt
1. {action}
2. {action}
3. Lancer `pnpm test` et vérifier tous les cas de §Tests à écrire du prompt
4. Mettre à jour `PROGRESS.md` (déplacer le prompt en completed)

#### Décisions prises pendant la session
- {décision 1 — justification}
- {décision 2 — justification}

#### Questions ouvertes / ambiguïtés
- {question 1 — proposition de réponse si j'avais continué}
- {question 2}

#### Fichiers touchés (chemins absolus dans le repo)
- `{chemin/fichier1.ts}` — créé
- `{chemin/fichier2.ts}` — modifié
- `{chemin/fichier3.test.ts}` — créé, tests écrits mais pas tous verts

#### Environnement au moment du gel
- `pnpm typecheck` : {vert | N erreurs — lesquelles}
- `pnpm lint` : {vert | N warnings}
- `pnpm test` : {N passing / M total — lesquels échouent}
- Infra locale : {postgres up | redis up | mock MP up}

#### Pointeurs pour la reprise
- Commit WIP poussé : oui/non, hash {hash}
- PR ouverte : non (WIP) — à ouvrir après clôture
- Issue(s) ouverte(s) : {liens}
- Logs/erreurs pertinents à reconsulter : `{chemin ou commande}`

#### Recommandation pour la session suivante
- **Peut reprendre** en autonomie : oui/non
- **Si non** : demander arbitrage humain sur {point précis}
- **Temps estimé** pour clore : {minutes}
- **Contexte minimal à recharger** : lire `CLAUDE.md §{X}`, `docs/01-brief.md §{Y}`, `{skill}/SKILL.md`, + cet état figé.
```

---

## Règles d'usage

1. **Déclencher tôt, pas trop tard** — quand le contexte atteint ~80% de la fenêtre, pas 99%. Mieux vaut un résumé propre que du code à moitié cassé.
2. **Pas d'ambigüité** — chaque item `En cours (incomplet)` doit permettre à la session suivante de reprendre sans relire tout le prompt.
3. **Commit WIP obligatoire** — avant de produire le résumé, `git add -A && git commit -m "wip({ID}): {détail}"` et push. Sans code versionné, le résumé est un vœu pieux.
4. **Pas de PR** — une PR est ouverte **seulement** quand le prompt est complet, DoD cochée, tests verts.
5. **Ne pas masquer les bugs** — si quelque chose ne compile pas ou un test échoue pour une raison non résolue, c'est dans le résumé. La session suivante préfère savoir.

---

## Exemple rempli (fictif) — pour référence

```markdown
### État figé pour reprise — 2026-05-14 17:42

#### Prompt en cours
- **ID** : A2.5-availability-push-queue
- **Branche Git** : feat/A2.5-availability-push-queue
- **Dernier commit** : a3f8e21 — "wip(A2.5): idempotency table + outbox pattern draft"
- **Statut** : in_progress_paused — motif : contexte saturé

#### Ce qui est FAIT
- [x] Migration Prisma `outbound_idempotency_keys` créée et appliquée en local
- [x] Interface `AvailabilityPushPort` définie dans `packages/domain/src/availability/`
- [x] Adapter BullMQ `AvailabilityPushQueueAdapter` dans `apps/api/src/infrastructure/queues/`
- [x] Tests unit du pattern outbox (8/8 verts)

#### Ce qui est EN COURS (incomplet)
- [~] Implémentation du client HTTP MovePlanner signé — fait à 60%
  - Fichier : `apps/api/src/infrastructure/moveplanner/availability-client.ts` — ligne 140
  - Reste à faire : gestion du retry exponentiel + circuit breaker opossum, typage de la réponse 200 en Result<Accepted, Rejected>

#### Ce qui reste à faire pour CLORE ce prompt
1. Finir le client HTTP (retry + circuit breaker)
2. Brancher le worker BullMQ sur le client
3. Tests d'intégration avec mock MP local (5 cas : OK, 429, 5xx, timeout, 401)
4. Ajouter métriques prom-client (`availability_push_total`, `availability_push_duration_seconds`)
5. Mettre à jour `PROGRESS.md` et ouvrir PR

#### Décisions prises pendant la session
- Choix opossum plutôt que cockatiel — raison : meilleure intégration avec BullMQ, stats natives
- Idempotency key = UUID v4 généré côté application, pas hash du payload — raison : rejeu sûr même si payload identique retenté intentionnellement

#### Questions ouvertes / ambigüités
- Que faire en cas de 409 "stale availability" renvoyé par MP ? Proposition : considérer comme succès (MP a une version plus fraîche), marquer l'envoi comme "superseded" sans retry.

#### Fichiers touchés
- `apps/api/src/infrastructure/moveplanner/availability-client.ts` — créé, 60% complet
- `apps/api/src/infrastructure/queues/availability-push.queue.ts` — créé, worker squelette
- `packages/domain/src/availability/availability-push.port.ts` — créé
- `apps/api/prisma/migrations/20260514_outbound_idempotency/migration.sql` — créé, appliqué
- `apps/api/src/infrastructure/moveplanner/availability-client.test.ts` — 2 tests verts, manque 4

#### Environnement au moment du gel
- `pnpm typecheck` : vert
- `pnpm lint` : vert
- `pnpm test` : 12/14 passing (2 tests client HTTP échouent sur retry — pas encore implémenté)
- Infra locale : postgres up, redis up, mock MP up (port 3030)

#### Pointeurs pour la reprise
- Commit WIP : poussé, a3f8e21
- PR ouverte : non
- Logs : `apps/api/logs/dev.log` pour voir les requêtes vers mock MP

#### Recommandation pour la session suivante
- Peut reprendre en autonomie : oui
- Temps estimé pour clore : 90 min
- Contexte minimal : CLAUDE.md §4 (règles intégration MP), docs/02-partners-specification.md §7.5 (fiche auth), skills/integration/moveplanner-api/SKILL.md, cet état figé.
```

---

**Fin du gabarit**
