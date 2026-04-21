# Orchestrateur de prompts — Protocole

> **Version** : 1.0 — 2026-04-21
> **Rôle** : piloter l'exécution séquentielle des prompts du projet, conserver l'état entre sessions, et permettre la reprise après interruption ou saturation de contexte.
> **À lire avant** : `CLAUDE.md`, `docs/03-plan-de-dev.md`, `prompts/PROMPTS.md`

---

## 1. Pourquoi un orchestrateur

Claude a un **contexte limité**. Un projet de 11 semaines ne tient pas dans une seule session. Sans discipline, on perd :

- les décisions techniques prises dans une session antérieure,
- l'état réel du code (quel prompt a été exécuté, quelle PR est ouverte),
- les blockers et dettes techniques en attente,
- la cohérence inter-sprints.

L'orchestrateur résout ce problème par **trois fichiers persistants** dans `prompts/orchestrator/` :

| Fichier | Rôle | Mise à jour |
|---------|------|-------------|
| `PROGRESS.md` | État actuel : prompts en attente / en cours / terminés, blockers ouverts | À chaque fin de prompt |
| `SESSION-LOG.md` | Journal chronologique détaillé de chaque session Claude | En continu |
| `RESUME-TEMPLATE.md` | Gabarit pour résumer l'état quand le contexte sature | Référence seule |

---

## 2. Architecture mentale

```
                ┌──────────────────────────────┐
                │   PROMPTS.md  (catalogue)    │
                │   A0.1 → A6.7                │
                └──────────────┬───────────────┘
                               │
                               ▼
                ┌──────────────────────────────┐
                │        ORCHESTRATOR          │
                │  lit PROGRESS.md             │
                │  choisit prochain prompt     │
                │  vérifie dépendances (DAG)   │
                │  contrôle blockers           │
                └──────────────┬───────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         ▼                     ▼                     ▼
   Session Claude       Session Claude       Session Claude
   (prompt A2.3)        (prompt A2.4)        (prompt A3.1)
                               │
                               ▼
                     met à jour PROGRESS.md
                     ajoute entrée SESSION-LOG.md
                     pousse PR
```

L'orchestrateur n'est **pas un programme** qui tourne en background : c'est un **protocole écrit** que toute session Claude applique mécaniquement. La "mémoire" est dans les fichiers Markdown versionnés avec le code.

---

## 3. Protocole de session Claude

Toute session Claude qui ouvre ce projet pour y travailler suit **exactement** ces étapes :

### Étape 1 — Ingestion (≤ 5 min)

1. Lire `CLAUDE.md` en entier.
2. Lire `docs/03-plan-de-dev.md` — repérer le sprint courant.
3. Lire `prompts/orchestrator/PROGRESS.md` — c'est ici que se trouve la vérité de l'état.
4. Lire les 3 dernières entrées de `SESSION-LOG.md` pour comprendre ce qui s'est passé juste avant.
5. Identifier **un seul** prompt à exécuter (champ `Prochain prompt` de `PROGRESS.md`).

### Étape 2 — Vérification des conditions

Avant d'exécuter le prompt, vérifier :

- [ ] Les prompts listés en `blockedBy` sont bien en `completed`.
- [ ] Les skills listées dans l'en-tête du prompt sont disponibles (lire les `SKILL.md`).
- [ ] Aucun blocker ouvert dans `PROGRESS.md` n'empêche ce prompt.
- [ ] La branche Git mentionnée n'existe pas déjà (sinon on reprend).

Si une condition n'est pas remplie : **ne pas exécuter**. Remonter dans `SESSION-LOG.md` sous la forme d'un blocker, suggérer un prompt alternatif, attendre validation humaine.

### Étape 3 — Ouverture de session

Ajouter en tête de `SESSION-LOG.md` :

```markdown
## Session {YYYY-MM-DD HH:mm} — Prompt {ID}

- **Opérateur** : Claude {modèle} — déclencheur : {user | orchestrator | scheduled}
- **Prompt exécuté** : {ID} — {titre court}
- **Sprint** : {A.N}
- **Branche Git** : `feat/{ID}-{slug}`
- **Skills chargées** : {liste}
- **Dépendances vérifiées** : OK
- **Objectif de la session** : {1 phrase}

### Déroulé
{en cours...}
```

### Étape 4 — Exécution

Suivre les instructions du prompt à la lettre. Les prompts sont auto-suffisants : ils listent les fichiers à créer, les tests à écrire, la Definition of Done.

Consigner dans la section `Déroulé` :
- chaque décision non triviale (et son alternative rejetée),
- chaque fichier créé ou modifié (chemin),
- chaque dette technique introduite volontairement (TODO qualifié avec ticket).

### Étape 5 — Contrôles qualité

Avant de fermer la session :

- [ ] `pnpm typecheck` vert
- [ ] `pnpm lint` vert
- [ ] `pnpm test` vert (unit + intégration concernés)
- [ ] Couverture ≥ seuil module (voir `CLAUDE.md` §2.3)
- [ ] Audit log écrit pour toute mutation de donnée conforme LSE/CCT
- [ ] PR ouverte avec description complète et DoD cochée

### Étape 6 — Clôture et passation

Mettre à jour `PROGRESS.md` :

- Déplacer le prompt en `completed` avec lien PR et commit hash de référence
- Mettre à jour `Prochain prompt` en lisant le DAG de `PROMPTS.md`
- Ajouter les blockers découverts (section `Blockers ouverts`)
- Mettre à jour les métriques (nombre de prompts faits / restants)

Clore l'entrée de `SESSION-LOG.md` :

```markdown
### Livrables
- {fichiers clés créés/modifiés}
- PR : {URL ou numéro}

### Décisions
- {décision 1 avec justification}

### Dettes ouvertes
- [ ] {TODO qualifié + ticket}

### Prochain prompt suggéré
- {ID} — {raison}
```

---

## 4. Reprise après interruption ou saturation de contexte

C'est le cœur de l'utilité de l'orchestrateur.

### Cas A — Session plantée, nouvelle session reprend proprement

Rien à faire de spécial : la nouvelle session applique le protocole §3 depuis l'Étape 1. Elle lira dans `PROGRESS.md` le dernier prompt marqué `completed` et saura lequel attaquer.

### Cas B — Le contexte Claude sature en cours de prompt

Quand l'opérateur Claude sent le contexte se remplir (typiquement > 80% de la fenêtre), il **interrompt proprement** avant de produire du code incorrect :

1. **Stop** immédiat de toute nouvelle action.
2. Produire un **résumé de reprise** en suivant `RESUME-TEMPLATE.md`.
3. Pousser ce résumé dans `SESSION-LOG.md` sous la section `### État figé pour reprise`.
4. Mettre `PROGRESS.md` en état `in_progress_paused` pour le prompt en question, avec pointeur vers la section de SESSION-LOG.
5. Ne pas ouvrir de PR incomplète — commit WIP sur la branche dédiée, poussé, et mention dans le résumé.

La session Claude suivante lira le résumé et reprendra exactement là où on a arrêté.

### Cas C — Le fondateur ou lead demande un changement de priorité en cours

L'orchestrateur applique le protocole de "suspension" :

1. Finir le bloc cohérent en cours (pas de code à moitié écrit).
2. Commit WIP, push, état `in_progress_suspended`.
3. Entrée dans `SESSION-LOG.md` avec motif clair.
4. Attaquer la nouvelle priorité via un nouveau prompt (ou prompt ad-hoc si non catalogué — voir §6).
5. Réassigner `Prochain prompt` à la reprise.

---

## 5. Règles de décision de l'orchestrateur

Quand plusieurs prompts sont candidats (tous dépendances OK, non bloqués), appliquer dans l'ordre :

1. **Chemin critique** — prompt du sprint courant > prompt d'un sprint futur anticipé.
2. **ROI conformité** — un prompt qui ferme une faille LSE/CCT/nLPD passe avant une feature confort.
3. **Déblocage** — un prompt qui débloque ≥ 2 autres prompts passe avant un prompt isolé.
4. **Taille** — à égalité, préférer le plus court pour tenir dans une session sans risque de saturation.
5. **Identifiant croissant** — dernier départage, ordre de catalogue.

---

## 6. Prompts ad-hoc (hors catalogue)

Si un besoin émerge qui n'est pas dans `PROMPTS.md` (bug à corriger, feature inattendue, demande fondateur), on crée un prompt `AH.NNN` :

- `AH.NNN-titre.md` dans `prompts/adhoc/`
- En-tête standard (voir gabarit §7)
- Référencé dans `PROGRESS.md` dans la section `Prompts ad-hoc`
- Rétroactivement intégré à un sprint si le pattern se répète

---

## 7. Gabarit d'en-tête de prompt

Tout prompt (catalogue ou ad-hoc) commence par :

```markdown
# {ID} — {Titre lisible}

> **Sprint** : {A.N}
> **Effort estimé** : {S | M | L} — {0.5 j | 1 j | 2 j}
> **BlockedBy** : {IDs ou —}
> **Blocks** : {IDs ou —}
> **Skills requises** : {liste chemins skills/**/SKILL.md}
> **Branche cible** : `feat/{ID}-{slug}`
> **Definition of Done** :
> - [ ] {critère 1}
> - [ ] {critère 2}

## Contexte
{1–2 paragraphes rattachant au brief ou à la spec}

## Fichiers à créer / modifier
- `path/one.ts`
- `path/two.test.ts`

## Instructions
{étapes numérotées, testables}

## Tests à écrire
{liste explicite des cas à couvrir}

## Références
- `docs/01-brief.md §X`
- `docs/02-partners-specification.md §Y`
- `prompts/PROMPTS.md#{ID}`
```

---

## 8. Contrôles périodiques (weekly)

Chaque vendredi, une session "ops" exécute le prompt méta `OPS.weekly-review.md` qui :

- Lit `PROGRESS.md` et `SESSION-LOG.md` de la semaine.
- Vérifie qu'aucun prompt n'est en `in_progress_paused` depuis > 7 jours (sinon escalade).
- Compile un résumé vendredi 17h partagé par email au fondateur.
- Met à jour les métriques : vélocité (prompts/sem), dette technique (nb TODO qualifiés), dette conformité (blockers `compliance/`).
- Archive les sessions > 30 j dans `prompts/orchestrator/archive/YYYY-Www.md`.

---

## 9. Anti-patterns à proscrire

- ❌ Démarrer un prompt sans lire `PROGRESS.md`. Résultat : collisions, doublons, régressions.
- ❌ Finir une session sans mettre à jour `PROGRESS.md`. Résultat : la session suivante est aveugle.
- ❌ Écrire du code "à cheval" sur deux prompts dans une même PR. Résultat : impossible à reviewer, DoD flou.
- ❌ Skipper la vérif HMAC d'un webhook "pour aller vite" en dev. Résultat : mauvais réflexe qui fuit en prod.
- ❌ Cocher la DoD sans avoir lancé les tests d'intégration MovePlanner. Résultat : régression découverte en sprint suivant.
- ❌ Garder un blocker non documenté dans sa tête. Résultat : perte d'info à la moindre interruption.

---

## 10. Point de vérité

En cas de désaccord entre fichiers, la hiérarchie est :

1. **Loi suisse** (LSE, CCT, LTr, nLPD)
2. `docs/02-partners-specification.md` (contrat d'interface MP, figé par version)
3. `docs/01-brief.md` (vision métier)
4. `CLAUDE.md` (règles de dev)
5. `prompts/orchestrator/PROGRESS.md` (état réel)
6. `prompts/PROMPTS.md` (plan catalogué)
7. Le code dans `main`

Si un prompt pousse un choix qui contredit un niveau supérieur, il est **refusé** et l'orchestrateur ouvre une ADR pour arbitrage humain.

---

**Fin du protocole v1.0**
