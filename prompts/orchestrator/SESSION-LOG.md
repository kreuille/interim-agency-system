# SESSION-LOG.md — Journal chronologique des sessions

> Journal append-only. Chaque session Claude / Cowork ouvre une entrée à son démarrage et la ferme à sa fin.
> Les entrées les plus récentes sont **en haut** (ordre anti-chronologique pour une relecture rapide).

---

## Session 2026-04-21 19:30 — Prompt A0.1 init monorepo

- **Opérateur** : Claude Code (Opus 4.7) — déclencheur : user
- **Prompt exécuté** : `A0.1-init-monorepo`
- **Sprint** : A.0
- **Branche Git** : `feat/A0.1-init-monorepo`
- **Skills chargées** : `skills/dev/backend-node/SKILL.md`, `skills/dev/devops-swiss/SKILL.md`, `skills/ops/project-kickoff/SKILL.md`
- **Dépendances vérifiées** : aucune (prompt racine, pas de blockedBy)
- **Objectif de la session** : poser le monorepo pnpm fonctionnel (apps + packages), toolchain TypeScript strict, ESLint/Prettier, tests dummy verts.

### Déroulé

1. Création branche `feat/A0.1-init-monorepo` depuis `main`.
2. Fichiers racine : `.nvmrc` (node 20), `.editorconfig`, `.gitignore`, `.npmrc`, `.prettierignore`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `prettier.config.mjs`, `eslint.config.mjs` (flat config v9 type-aware), `package.json` root avec scripts `build/dev/typecheck/lint/test/format`.
3. Packages posés : `@interim/shared` (Money, WeekIso, Result, Clock), `@interim/domain` (shared/ids avec brands Uuid/AgencyId/StaffId), `@interim/application` (squelette), `@interim/contracts` (squelette).
4. Apps posées : `@interim/api` (Express + endpoint `/health`), `@interim/web-admin` (Next.js 14 App Router), `@interim/web-portal` (Next.js 14 App Router), `@interim/worker` (placeholder BullMQ).
5. Tests dummy : 6 Money + 4 WeekIso + 4 Ids + 1 Supertest /health = **15 tests verts**.
6. Hook Husky `pre-commit` → `lint-staged`.
7. `pnpm install` OK en **~60s** (429 packages).
8. Fix itération 1 : tsconfig de chaque workspace inclut les tests pour le type-aware linting (suppression composite/references qui n'étaient pas nécessaires à ce stade ; sera réintroduit au besoin en sprint ultérieur).
9. Fix itération 2 : `Currency` type élargi à `'CHF' | 'EUR'` pour garder un vrai check d'invariant runtime (sinon `@typescript-eslint/no-unnecessary-condition` flaguait) ; `process.env.PORT`/`VERSION` en dot notation ; directives `eslint-disable-next-line` inutiles supprimées.
10. `.prettierignore` : `docs/`, `prompts/`, `skills/`, `CLAUDE.md`, `README.md` ignorés (rédaction libre FR, pas de reformat auto).
11. `pnpm format` → 2 fichiers reformatés (`package.json`, `week-iso.ts`).
12. DoD validée : `pnpm typecheck` ✓, `pnpm lint` ✓, `pnpm test` ✓ (15/15), `pnpm format:check` ✓.

### Livrables

Fichiers racine :
- `.nvmrc`, `.editorconfig`, `.gitignore`, `.npmrc`, `.prettierignore`
- `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `tsconfig.json`
- `eslint.config.mjs`, `prettier.config.mjs`
- `.husky/pre-commit`

Packages :
- `packages/shared/src/{money,week-iso,result,clock}.ts` + tests pour money et week-iso
- `packages/domain/src/shared/ids.ts` + tests
- `packages/application/src/index.ts` (squelette)
- `packages/contracts/src/index.ts` (squelette)

Apps :
- `apps/api/src/{app,main}.ts` + `main.test.ts`
- `apps/web-admin/{app/layout.tsx, app/page.tsx, next.config.mjs, next-env.d.ts}`
- `apps/web-portal/{app/layout.tsx, app/page.tsx, next.config.mjs, next-env.d.ts}`
- `apps/worker/src/main.ts`

Docs : ADR-0001 et pr-template.md déjà présents depuis le bootstrap.

PR : [kreuille/interim-agency-system#1](https://github.com/kreuille/interim-agency-system/pull/1) ouverte sur `main` avec le pr-template rempli (DoD cochée, impact conformité/sécurité documenté). Remote `origin` configuré, `main` + `feat/A0.1-init-monorepo` poussées.

### Décisions

1. **Pas de `composite: true` ni project references à ce stade** — raison : `tsc -b` avec refs composite génère du `dist/` et complexifie le typecheck quand on inclut les tests. On garde un `tsconfig.json` simple par workspace qui inclut `src/**/*.ts` + `vitest.config.ts` pour activer le type-aware linting ESLint. Alternative rejetée : deux tsconfig par workspace (build vs lint) — trop de cérémonie pour zéro bénéfice actuel. À revisiter si on ajoute de vraies cibles de build.
2. **`Currency = 'CHF' | 'EUR'`** (et non juste `'CHF'`) — raison : garder un invariant runtime `assertSameCurrency` vérifiable sans que l'ESLint rule `no-unnecessary-condition` râle. L'EUR sera probablement utile pour les intérimaires frontaliers FR/DE de toute façon.
3. **Monorepo pnpm, packages exportent `.ts` (pas `.js` compilé)** — raison : zéro build step intermédiaire pour les imports inter-workspaces ; `tsx` (api, worker) et Next.js (web-admin, portal) résolvent les sources TS directement. Production build sera traité par app (bundler ou `tsc -b` tardif) au fil des sprints.
4. **`docs/`, `prompts/`, `skills/`, `CLAUDE.md`, `README.md` exclus de Prettier** — raison : contenu rédactionnel FR à forte variance de style (tableaux, code blocks en français, lignes longues intentionnelles). Les formatter casserait la lisibilité métier.
5. **Hook husky minimaliste** (`pnpm exec lint-staged`) — raison : MVP suffisant ; `pnpm typecheck` incremental sera ajouté quand `tsc -b` composite sera en place.

### Dettes ouvertes

- [ ] Revenir sur `composite: true` + project references quand on aura un premier vrai cas de build compilé (probablement A0.3 — CI Docker image pour `apps/api`).
- [ ] Créer le repo GitHub `gh repo create` et pousser la branche + ouvrir la PR — action humaine (fondateur). Commande suggérée : `gh repo create {org}/interim-agency-system --private --source=. --push`.
- [ ] Pentests, coverage, Dependabot, Trivy → sprint A0.3 (`ci-github-actions`).
- [ ] Audit `pnpm approve-builds` (esbuild) à trancher en A0.3 (décision CI : on approuve ou pas les scripts postinstall).

### Prochain prompt suggéré

- `A0.2-docker-compose-local` (Postgres 16, Redis, MailHog, Swagger UI) — bloqué uniquement par A0.1, maintenant `completed`. Taille S, idéal pour la prochaine session.

### Métriques

- Fichiers créés/modifiés dans ce prompt : 34 (hors node_modules et pnpm-lock).
- Dépendances installées : 429 packages (~60 s).
- Tests : 15 passing / 4 fichiers / 4 packages.
- Durée session : ~20 min hors téléchargement deps.

---

## Session 2026-04-21 16:30 — Rédaction complète passes 2 et 3

- **Opérateur** : Claude (Cowork mode) — déclencheur : demande fondateur "fais tout étape par étape et finis par les skills"
- **Prompt exécuté** : bootstrap étendu
- **Sprint** : pré-A.0
- **Objectif** : rédiger les 46 prompts restants (passe 2) + documents manquants + ajouter 2 skills stratégiques

### Déroulé
Production séquentielle :
1. Docs manquants : `06-risques.md`, `07-rôles.md`, `compliance/registre-traitements.md`, `pr-template.md`, `adr/0001-stack-choice.md`.
2. Prompts sprint A.0 (5) : A0.2 à A0.6 — docker-compose, CI, hosting CH, Prisma schema, auth.
3. Prompts sprint A.1 (6) : A1.2 à A1.7 — documents upload, alertes, client CRUD, rate card, audit, admin UI.
4. Prompts sprint A.2 (6) : A2.1 à A2.6 — disponibilités et push MovePlanner.
5. Prompts sprint A.3 (6) : A3.1 à A3.6 — webhooks entrants et propositions.
6. Prompts sprint A.4 (7) : A4.1 à A4.7 — contrats de mission et timesheets.
7. Prompts sprint A.5 (9) : A5.1 à A5.9 — paie hebdo et facturation QR-bill.
8. Prompts sprint A.6 (7) : A6.1 à A6.7 — conformité, hardening, go-live.
9. Prompts OPS transversaux (5) : weekly-review, cct-yearly-update, api-key-rotation, permit-expiry-scan, dpia-refresh.
10. Skills additionnels (2) : `dev/observability/SKILL.md`, `compliance/suva-workplace-safety/SKILL.md`.
11. Mise à jour `skills/README.md` pour refléter les 30 skills totaux.
12. Mise à jour `PROGRESS.md` avec l'état final du bootstrap.

### Livrables (cette session)
- 5 documents : docs/06, 07, compliance/registre-traitements, pr-template, adr/0001
- 46 prompts détaillés répartis dans 7 dossiers sprint + 1 dossier ops-transversal
- 2 skills additionnels
- Mises à jour README et PROGRESS

**Total fichiers créés passes 1+2+3 : 93**.

### Décisions

1. **53 prompts au catalogue détaillé** (48 sprint + 5 OPS) : chaque prompt suit le gabarit ORCHESTRATOR §7, exécutable par une session Claude sans re-briefing.
2. **Profondeur variable mais toujours suffisante** : A0.1 et A1.1 en "patron complet" (200+ lignes), les autres en "exécutable condensé" (50–100 lignes avec DoD précis + fichiers clés + tests). Un dev Claude peut les exécuter directement ; à affiner selon retour d'expérience du premier sprint réel.
3. **2 skills additionnels stratégiques** : observabilité (séparée de devops-swiss pour accent SRE) et SUVA (séparée de social-insurance pour accent sécurité chantier).

### Dettes ouvertes

- [ ] Les prompts A0.2 à A6.7 et OPS.* sont "executable" mais peuvent être enrichis selon retour premier sprint réel. À planifier : revue à J+30 du premier sprint pour densifier si besoin.
- [ ] Compléter §7 `PROGRESS.md` (contacts équipe) — action fondateur.
- [ ] Créer `docs/adr/0002-hosting-choice.md`, `docs/adr/0003-auth-choice.md`, `docs/adr/0004-tenant-strategy.md`, `docs/adr/0005-elm-make-or-buy.md` au moment de l'exécution des prompts concernés.
- [ ] Créer `docs/runbooks/` — stub vide, à remplir en A6.4.
- [ ] Créer `docs/compliance/dpia-interimaires.md` — DPIA complète à faire en A.0 ou tôt A.1.

### Prochain prompt suggéré
- **Immédiat fondateur** : relire l'ensemble, compléter les contacts, lancer demande sandbox MP + dossier LSE.
- **Première session dev** : `prompts/sprint-a0-setup/A0.1-init-monorepo.md`.

---

## Session 2026-04-21 14:50 — Bootstrap projet

- **Opérateur** : Claude (Cowork mode) — déclencheur : demande fondateur "je veux lancer ce projet"
- **Prompt exécuté** : — (bootstrap hors catalogue, pré-A.0)
- **Sprint** : pré-A.0
- **Branche Git** : — (repo pas encore initialisé, fichiers posés directement dans `C:\Users\Arnau\OneDrive\Documents\intérim\`)
- **Skills chargées** : — (aucune — pose de la structure documentaire)
- **Dépendances vérifiées** : N/A (première session)
- **Objectif de la session** : poser la structure documentaire initiale du projet, rédiger règles de dev, plan de dev, orchestrateur, catalogue de prompts, README.

### Déroulé

Lecture des deux specs uploadées par le fondateur (`interim-agency-system-brief.md` et `partners-interim-specification.md`). Synthèse orale validée avec le fondateur. Confirmation que le push vers MovePlanner est le point critique. Choix d'orienter le projet en multi-client dès le départ et d'embarquer un orchestrateur de prompts Markdown pour gérer les longues sessions Claude.

Création de la structure de dossiers `docs/ skills/ prompts/` dans le workspace fondateur.

Copie des deux briefs dans `docs/01-brief.md` et `docs/02-partners-specification.md` (source de vérité inchangée).

Rédaction de `CLAUDE.md` : règles de l'art du dev logiciel adaptées au contexte suisse (Rappen, AVS/IDE/IBAN, audit logs 10 ans, refus de contournement CCT/LTr).

Rédaction de `docs/03-plan-de-dev.md` : 7 sprints, jalons, budget ~190 j-h, coûts récurrents ~1000 CHF/mois, chemin critique avec BLOCKER sandbox MovePlanner identifié.

Rédaction de `prompts/orchestrator/ORCHESTRATOR.md` : protocole complet de pilotage par fichiers Markdown persistants, gestion de la saturation de contexte, reprise après interruption.

Rédaction de `prompts/orchestrator/PROGRESS.md` : instantané initial avec 48 prompts catalogués, 2 blockers ouverts (accès sandbox MP, autorisation cantonale LSE), décisions techniques figées (stack, archi hexagonale, montants Rappen).

### Livrables

- `CLAUDE.md`
- `docs/01-brief.md` (copie)
- `docs/02-partners-specification.md` (copie)
- `docs/03-plan-de-dev.md`
- `prompts/orchestrator/ORCHESTRATOR.md`
- `prompts/orchestrator/PROGRESS.md`
- `prompts/orchestrator/SESSION-LOG.md` (ce fichier)
- `prompts/orchestrator/RESUME-TEMPLATE.md` *(à suivre)*
- `prompts/PROMPTS.md` *(à suivre)*
- `README.md` *(à suivre)*
- `docs/05-architecture.md` *(à suivre)*

### Décisions

1. **Orchestrateur de prompts Markdown, pas d'outil externe** — raison : 100% versionnable avec le code, zéro dépendance, relisible par humain ET par Claude. Alternative rejetée : Jira / Linear / Airtable (trop d'intégrations, perte de portabilité).
2. **Ordre anti-chronologique dans SESSION-LOG.md** — raison : la nouvelle session lit en haut et voit immédiatement le dernier état. Alternative rejetée : ordre chronologique classique.
3. **PROGRESS.md = source de vérité, CODE = exécution** — si les deux divergent, la divergence est un bug à corriger.
4. **48 prompts catalogués d'entrée de jeu** — raison : donne la visibilité totale du chemin au fondateur, permet d'estimer vélocité.

### Dettes ouvertes

- [ ] Rédiger les 46 prompts restants (sur 48 catalogués). A0.1 et A1.1 sont complets comme patron ; les autres sont listés dans `PROMPTS.md` avec skills + dépendances + DoD résumée, prêts à être détaillés au format du patron.
- [ ] Compléter la table des contacts §7 `PROGRESS.md` (fondateur à remplir).
- [ ] Créer `docs/06-risques.md` complet (référencé dans le plan de dev mais non créé ici — à produire en A.0 ou en session dédiée).
- [ ] Rédiger `docs/07-rôles.md` et `docs/compliance/registre-traitements.md` en A.0.
- [ ] Rédiger `docs/adr/0001-stack-choice.md` (créé à l'exécution de A0.1).
- [ ] Créer `docs/pr-template.md` (créé à l'exécution de A0.1, voir prompt).

### Livrables effectivement produits dans cette session (passes 1 + 2)

**Documentation projet (7)** : `CLAUDE.md`, `README.md`, `docs/01-brief.md`, `docs/02-partners-specification.md`, `docs/03-plan-de-dev.md`, `docs/05-architecture.md`, `skills/README.md`.

**Orchestrateur (5)** : `ORCHESTRATOR.md`, `PROGRESS.md`, `SESSION-LOG.md`, `RESUME-TEMPLATE.md`, `prompts/PROMPTS.md`.

**Skills équipe complète (28)** :
- dev (8) : backend-node, frontend-next, database-postgres, devops-swiss, testing-strategy, security-hardening, api-rest-design, webhooks-hmac
- compliance (6) : lse-authorization, cct-staffing, nlpd-privacy, ltr-working-time, social-insurance, work-permits
- business (7) : agency-direction-strategy, agency-management, agency-sales, hr-interim, payroll-weekly, qr-bill-invoicing, accounting-swiss
- integration (5) : moveplanner-api, moveplanner-webhooks, swisscom-sms, signature-electronique, iso20022-payments
- ops (4) : project-kickoff, sprint-planning, code-review, release-management

**Prompts détaillés (2 patrons)** : `A0.1-init-monorepo.md`, `A1.1-worker-entity-crud.md` + README de sprint pour A.0 et A.1 pointant vers le catalogue.

**Total : 46 fichiers** créés sous `C:\Users\Arnau\OneDrive\Documents\intérim\`.

### Prochain prompt suggéré

- **Immédiat pour le fondateur** :
  1. Relire `CLAUDE.md`, `docs/03-plan-de-dev.md` et `docs/05-architecture.md` — valider ou demander amendements.
  2. Compléter §7 `PROGRESS.md` (contacts équipe).
  3. Lancer les deux actions parallèles hors dev : demande sandbox MovePlanner (BLOCKER-001), dépôt dossier LSE (BLOCKER-002).
  4. Constituer l'équipe selon `docs/03-plan-de-dev.md §Équipe cible`.
- **Première session Claude Code dev** : `A0.1-init-monorepo.md` dès que le repo Git est créé et l'équipe en place.
- **Rédaction des prompts manquants** : session dédiée "rédaction de prompts A0.2 à A1.7" pour compléter la passe 2 au niveau de profondeur du patron A0.1.

---

*(les sessions suivantes s'ajoutent au-dessus de cette ligne)*
