# SESSION-LOG.md — Journal chronologique des sessions

> Journal append-only. Chaque session Claude / Cowork ouvre une entrée à son démarrage et la ferme à sa fin.
> Les entrées les plus récentes sont **en haut** (ordre anti-chronologique pour une relecture rapide).

---

## Session 2026-04-22 07:35 — Dettes 001/003/004/005/009/011/012 fermées en chaîne

- **Opérateur** : Claude Code (Opus 4.7) — déclencheur : user "continue et resoud les dettes automatiquement"
- **Branche** : `chore/resolve-dette-020-023` (continuée)

### DETTE-005 + 009 + 012 — API container

- `apps/api/Dockerfile` multi-stage : deps (pnpm install + prisma generate) → build → runtime tsx.
- Bug Windows pnpm symlinks corrigé via `.dockerignore` racine. Smoke `/health` OK.
- Service `api` profil `e2e` dans docker-compose. Job CI `build-api`.
- DETTE-012 fermée par recouvrement.

### DETTE-011 — Testcontainers Postgres

- `vitest.integration.config.ts` séparé. `pnpm test:integration` + job CI.
- 6 tests sur `PrismaWorkerRepository` (roundtrip, cross-tenant, unique, etc.).

### DETTE-004 — Husky pre-commit typecheck

- `pnpm typecheck` après `lint-staged`.

### DETTE-003 — pnpm approve-builds

- Whitelist `pnpm.onlyBuiltDependencies` en place depuis A0.5 → fermée par doc.

### DETTE-001 — Composite TS reportée A.6

### Métriques

- Dettes fermées : 6 + 1 reportée. Restantes : 5 (006, 008, 014, 015, 016 — externes ou A.6).
- Tests : 200 unit + 6 integration = **206**.

### Note push

Token `gh` toujours expiré. Commits locaux. Pour pousser : `gh auth login -h github.com` + `git push`.

---

## Session 2026-04-21 22:50 — Dettes 017/018/019/010 fermées

- **Opérateur** : Claude Code (Opus 4.7) — déclencheur : user "résoud dette 17 à 19"
- **Branche** : `chore/resolve-dette-017-018-019`

### DETTE-017 — Idempotency-Key inbound (fermée)

- Nouveau modèle Prisma `InboundIdempotencyKey` (migration `20260421194915_inbound_idempotency`), scoped `agencyId + idempotencyKey`, retention 24 h.
- `createIdempotencyMiddleware({ store })` : extrait `Idempotency-Key`, valide UUID v4, hash SHA-256 de `method|path|body`, intercepte `res.json` pour cacher uniquement les 2xx.
- 3 comportements : replay exact → réponse cachée, conflit (même key + body différent) → 422, miss (pas de key / GET) → passe-plat.
- `PrismaIdempotencyStore` dans `infrastructure/persistence/prisma/`.
- 7 tests avec store in-memory. Wired dans `app.ts` sur `/api/v1` derrière auth+tenant.

### DETTE-019 (+ DETTE-010 remplacée) — Tenant-guard Prisma (fermée)

- Extension Prisma `installTenantGuard(prisma)` via `$extends` : vérifie sur chaque opération tenant que `where.agencyId` / `data.agencyId` colle au `tryCurrentTenant().agencyId`.
- Fonction pure `assertTenantConsistent({ model, operation, args, contextAgencyId })` testable sans DB.
- `CrossTenantLeak` throw si mismatch. `TENANT_MODELS` (15) + `TENANT_GUARDED_ACTIONS` (14).
- Factory `createGuardedPrismaClient()`.
- 7 tests : match OK, mismatch where → throw, mismatch data create/upsert → throw, no-op Agency/idempotency, no-op hors contexte, no-op si agencyId absent.
- **Décision** : garde défensive plutôt qu'injection auto. Injection auto rend les oublis silencieux (retourne tout) ; la garde remonte les écarts immédiatement. DETTE-010 (injection auto) requalifiée-remplacée par DETTE-019.

### DETTE-018 — Coverage enforcement CI (fermée)

- `@vitest/coverage-v8` en devDependencies root.
- Chaque workspace testé a `test:coverage` + `coverage: { provider: 'v8', thresholds }` dans son `vitest.config.ts`.
- Seuils : `packages/domain` 85% (CLAUDE.md §2.3), `packages/shared` 80%, `packages/application` 80%, `apps/api` 70%, `apps/mock-moveplanner` 70%/60%.
- Nouveau job CI `test-coverage` : exécute `pnpm test:coverage` (échoue si seuils non-atteints) + upload HTML artifact.
- Tests additionnels pour atteindre les seuils : Clock (3), Result (3), Money edge cases (4), Email isValid (1), Name/Phone equals (2), domain errors (4), TempWorker changePhone/Email/rehydrate (4).

### Métriques

- Tests : 101 → **140** (+39)
- Coverage actuelle : domain 100% / shared 96.58% / app 84.14% / api 84.36% / mock 97.53%
- Dettes fermées : 4 (DETTE-010, 017, 018, 019)

---

## Session 2026-04-21 22:30 — Prompt A1.1 worker entity CRUD

- **Opérateur** : Claude Code (Opus 4.7) — déclencheur : user "continue"
- **Prompt** : `A1.1-worker-entity-crud`
- **Sprint** : A.1
- **Branche** : `feat/A1.1-worker-entity-crud`

### Déroulé

1. **VOs shared** : `Avs` (EAN-13), `Iban` (CH mod 97), `Canton` (26), `Name`, `Email`, `Phone` (E.164 + CH local auto). 28 nouveaux tests.
2. **Domain `@interim/domain`** : entité `TempWorker` avec factories `create`/`rehydrate`, méthodes `rename`/`changeIban`/`changeResidenceCanton`/`changeEmail`/`changePhone`/`archive`, snapshot frozen. Port `WorkerRepository`. Errors typées (`DomainError`, `WorkerNotFound`, `DuplicateAvs`, `WorkerArchived`). 7 tests entité.
3. **Application `@interim/application`** : 5 use cases + `AuditLogger` port + helpers `InMemory*` exportés. 14 tests.
4. **Infrastructure (apps/api)** : `PrismaWorkerRepository`, `PrismaAuditLogger`, Zod DTOs, Express router `createWorkersRouter` avec RBAC check, wire dans `app.ts` + OpenAPI spec.
5. **RBAC ajusté** : ajout `worker:delete` séparé de `worker:write`. Admin + HR = full, dispatcher = read+write (pas delete), viewer = read only.
6. **Tests HTTP supertest** : 9 tests (401, 403 viewer, 201 dispatcher + audit, 409 duplicate, 400 invalid AVS, 404 unknown, roundtrip, PUT, DELETE admin, 403 dispatcher DELETE, cross-tenant 404).
7. **ESLint** : rule `no-restricted-imports` rescopée à domain+application uniquement.

### DoD

- [x] Entité + VOs + use cases + repo Prisma + controllers REST + OpenAPI
- [x] Multi-tenant isolation testée (agence A vs B → 404)
- [x] Audit log écrit via port sur chaque mutation
- [x] `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` verts
- [ ] Idempotency-Key cache → DETTE-017
- [ ] Tests intégration Testcontainers → DETTE-011 (existante)
- [ ] Coverage measurement CI → DETTE-018

### Décisions

1. **`worker:write` / `worker:delete` actions distinctes** : dispatcher peut CRUD mais pas supprimer (conforme prompt A1.1).
2. **Soft delete via `archivedAt` + GET 404 par défaut, `?includeArchived=true` pour reprendre**.
3. **`AuditLogger` port applicatif** (pas appel direct Prisma depuis use case) — permet de swap l'impl pour Cloud Logging/Splunk plus tard.
4. **Repository `upsert` générique** : entité porte son état, Prisma dispatch insert/update.
5. **ESLint rule restreinte aux packages** domain/application : avant, ça bloquait le wire légitime `apps/api/src/app.ts → infrastructure/`.

### Dettes ouvertes (nouvelles)

- [ ] DETTE-017 : `Idempotency-Key` inbound cache pour POST/PUT (retry-safety).
- [ ] DETTE-018 : measure coverage CI + enforce seuils CLAUDE.md §2.3.
- [ ] DETTE-019 : Prisma middleware tenant-injection (complète DETTE-010).

### Prochain prompt suggéré

- `A1.2-worker-documents-upload` — bloqué par A1.1 ✅ ; logique codable localement, wire storage CMEK attend DETTE-015 (GCP provisioning).

### Métriques

- Fichiers : 25 nouveaux + modifs
- Tests nouveaux : **62**
- Total repo : **101 tests** (vs 39 après unblock)

---

## Session 2026-04-21 21:50 — Repo public + branch protection appliquée

- **Opérateur** : Claude Code (Opus 4.7) — déclencheur : user "1- passer public"
- **Objectif** : résoudre DETTE-013 en passant le repo public pour activer Rulesets gratuits.

### Déroulé

1. `gh repo edit --visibility public --accept-visibility-change-consequences` ✓
2. `gh api POST /rulesets` avec config `main-protection` : deletion + non_fast_forward + required_linear_history + pull_request (1 review, code owners, dismiss stale, last push approval, thread resolution) + required_status_checks strict (Lint + Typecheck + Unit tests + docker smoke) → **ruleset id 15364662 créé**.
3. `gh api PATCH` activation secret scanning + push protection ✓
4. `gh api PUT` vulnerability-alerts + automated-security-fixes → Dependabot alerts activés ✓
5. PROGRESS.md : DETTE-013 fermée, décision "repo public" ajoutée aux décisions figées. `docs/github-branch-protection.md` mis à jour.

### Livrables

- Repo passé public (irréversible pratiquement)
- Ruleset `main-protection` actif sur `refs/heads/main`
- Secret scanning + push protection + Dependabot security updates actifs

### Conséquences

- Tout push direct à `main` refusé. Merge uniquement via PR avec 1 review code owner + status checks verts.
- Pas de force-push ni de suppression de branche `main` possibles.
- Linear history imposée (rebase merge seulement, pas de merge commits).
- Le code et les docs métier sont publics — aucun secret n'y figure (CLAUDE.md §3.4 + `.env.example` respectés). Possibilité future de fork et de stars, pas un problème à ce stade.

### Décision

**Repo public** retenu vs GitHub Pro : (1) zéro coût récurrent, (2) ouvre la porte à OSS partiel si stratégique plus tard, (3) transparence métier cohérente avec la culture suisse d'ingénierie (même chose côté Swisscom, Infomaniak).

---

## Session 2026-04-21 21:20 — Déblocage BLOCKER-003, BLOCKER-004, DETTE-007

- **Opérateur** : Claude Code (Opus 4.7) — déclencheur : user "blocker-003 on fait gcp / fait blocker-004 / fait dette-007"
- **Sprint** : A.0 (clôture)
- **Branche** : `chore/unblock-sprint-a0`
- **Objectif** : acter le choix hosting GCP, scaffolder auth Firebase (A0.6 code-level), appliquer branch protection.

### Déroulé

1. **DETTE-007 (branch protection)** : essai `gh api PUT /repos/.../branches/main/protection` → **HTTP 403** ("Upgrade to GitHub Pro or make this repository public"). Essai Rulesets idem. → **Feature plan-payant sur repo privé** (~4 USD/mo GitHub Pro, ou passer le repo public). Documenté. DETTE-007 **requalifiée** en dette ouverte "plan GitHub à trancher" plutôt que résolue.
2. **BLOCKER-003 (hosting)** : user choisit GCP → ADR-0002 rédigé, `europe-west6` (Zurich). Services : Cloud Run, Cloud SQL PostgreSQL, Memorystore Redis, Cloud Storage CMEK/KMS, Secret Manager, OIDC Workload Identity Federation. Checklist conformité nLPD (DPA Google Cloud Switzerland GmbH). Blocker fermé côté **décision** ; le provisioning effectif reste une action humaine (A0.4).
3. **BLOCKER-004 (auth)** : ADR-0003 rédigé (Firebase Identity Platform, alignement GCP). Code A0.6 scaffolded :
   - `packages/domain/src/auth/role.ts` : enum `Role` (7 rôles), matrice RBAC typée `Action`, helper `canAccess`, flag `requiresMfa` (admin + payroll_officer) + 7 tests.
   - `apps/api/src/infrastructure/auth/firebase-admin.ts` : factory `getFirebaseApp()` / `getFirebaseAuth()` avec credential depuis JSON path (dev) ou ADC (GCP).
   - `apps/api/src/infrastructure/auth/firebase-verifier.ts` : implémente `TokenVerifier` en vérifiant ID token Firebase et extrayant custom claims (`agencyId`, `role`, `mfa_verified`, `email_verified`).
   - `apps/api/src/shared/middleware/auth.middleware.ts` : `createAuthMiddleware(verifier)` extrait Bearer, gate `emailVerified`, gate `requiresMfa(role) && !mfaVerified`, pose `req.user` pour le tenant middleware aval. 6 tests couvrant les 6 branches.
   - `docs/firebase-setup.md` : procédure détaillée pour le fondateur (projets, tenants, providers, claims, service account, `.env`).
4. Install `firebase-admin` 12.7.0 → quelques itérations lint (assertion inutile, require-await sur stubs, no-misused-promises). Factorisation du stubVerifier en fonction.
5. Validation DoD : typecheck ✓ / lint ✓ / format:check ✓ / test **39/39** (vs 26 avant).

### Livrables

- `docs/adr/0002-hosting-choice.md`
- `docs/adr/0003-auth-choice.md`
- `docs/firebase-setup.md`
- `packages/domain/src/auth/role.ts` + test (7 tests)
- `apps/api/src/infrastructure/auth/firebase-admin.ts`
- `apps/api/src/infrastructure/auth/firebase-verifier.ts`
- `apps/api/src/shared/middleware/auth.middleware.ts` + test (6 tests)
- `apps/api/package.json` (deps + `@interim/domain` en workspace)
- `packages/domain/src/index.ts` export `auth/role`

### Décisions

1. **Hosting = GCP `europe-west6` Zurich** (ADR-0002). Choix stratégique : alignement Firebase + Cloud Run + multi-region CH, au prix d'un DPA avec hyperscaler US. Réversible si Cloud SQL PostgreSQL (pas Firestore/Spanner).
2. **Auth = Firebase Identity Platform avec multi-tenancy native** (ADR-0003). Un `tenantId` Firebase = une agence ; custom claims portent `agencyId` + `role`.
3. **RBAC codé typé côté `@interim/domain`** : 7 rôles × 12 actions matricés. Compile-error si quelqu'un référence un rôle/action inexistant. MFA-required flag par rôle.
4. **`TokenVerifier` interface abstraite** : l'implémentation Firebase est dans `infrastructure/auth/firebase-verifier.ts`, le middleware dans `shared/middleware/` n'en dépend pas → facile à stubber en test, facile à remplacer par Supabase/Auth0 plus tard.
5. **DETTE-007 NON résolue** : GitHub facture les branch protections et Rulesets sur repo privé. Trois options documentées (Pro payant, repo public, laisser ouvert). Choix du fondateur à venir.

### Dettes ouvertes (nouvelles)

- [ ] DETTE-013 : trancher GitHub Pro vs repo public vs rien (DETTE-007 réécrite).
- [ ] DETTE-014 : créer les projets Firebase `interim-agency-system` + `-staging` selon `docs/firebase-setup.md` — action humaine fondateur.
- [ ] DETTE-015 : provisionner GCP `europe-west6` (Cloud SQL, Memorystore, Cloud Storage, Secret Manager, OIDC WIF) selon ADR-0002 — action humaine fondateur (A0.4 complet).
- [ ] DETTE-016 : Cloud Function `onCreate` qui pose les custom claims `agencyId` + `role` à l'inscription (A0.6 supplément côté Firebase).

### Prochain prompt suggéré

- `A1.1-worker-entity-crud` — A0.5 ✅, tenant middleware ✅, auth middleware ✅ (stub Firebase). Toutes les fondations sont posées pour A.1.
- A0.4 effective (provisioning) attend action humaine (DETTE-015).
- A0.6 effective (tenant Firebase créé) attend action humaine (DETTE-014).

### Métriques

- ADR nouveaux : 2 (0002 GCP, 0003 Firebase)
- Docs nouveaux : 1 (`firebase-setup.md`)
- Fichiers code : 5 (domain role + api firebase-admin + firebase-verifier + auth.middleware + export)
- Tests nouveaux : 13 (7 role + 6 auth.middleware)
- Total tests repo : **39** (vs 26 avant)

---

## Session 2026-04-21 20:55 — Prompt A0.5 Prisma schema v0

- **Opérateur** : Claude Code (Opus 4.7) — déclencheur : user (mode autonome)
- **Prompt** : `A0.5-prisma-schema-v0`
- **Sprint** : A.0
- **Branche** : `feat/A0.5-prisma-schema-v0`
- **Dépendances** : A0.1 ✅, A0.2 ✅ (Postgres local), A0.3 ✅ (CI qui re-validera)
- **Objectif** : schéma Prisma complet (toutes les entités §4.1 brief), migration initiale générée + appliquée, seed minimal, tenant middleware testé.

### Déroulé

1. `apps/api/prisma/schema.prisma` : 18 modèles + 13 enums. Toutes tables ont `agencyId`, `createdAt`, `updatedAt`, index composites. Montants en `BigInt` (Rappen). Relations FK `onDelete: Restrict` pour données légales. Énumérations pour tous les statuts.
2. `apps/api/prisma/seed.ts` : idempotent (upsert agency/workers/client/contract, findFirst/create pour rate card). 1 agence Pilote SA, 2 intérimaires (Jean Dupont GE, Marie Martin VD), 1 client MovePlanner SA, 1 contrat cadre MP-2026-001, 1 rate card Déménageur.
3. `apps/api/src/infrastructure/db/prisma.ts` : factory `createPrismaClient()` avec log scope par NODE_ENV.
4. `apps/api/src/shared/context/tenant-context.ts` : AsyncLocalStorage typé ; `runWithTenant`, `currentTenant`, `tryCurrentTenant`. 4 tests (throw sans contexte, exposition, isolation concurrente, try).
5. `apps/api/src/shared/middleware/tenant.middleware.ts` : Express middleware qui lit `req.user.agencyId`, wrappe le reste de la chaîne dans `runWithTenant`. 3 tests (401 sans user, 200 avec, isolation concurrente). Augmentation `namespace Express { interface Request { user?: AuthenticatedUser } }` (global, pas de module externe).
6. Install Prisma 5.22 + `@prisma/client` — ajouté `pnpm.onlyBuiltDependencies` pour esbuild/prisma afin que les postinstall scripts tournent (DETTE-003 partiellement résolue).
7. `DATABASE_URL=postgresql://dev:dev@localhost:5432/interim_dev?schema=public` → `prisma migrate dev --name init` ✓ (migration `20260421180913_init`).
8. Seed lancé contre la DB locale : 1 agence + 2 workers + 1 client + 1 rate card créés (idempotent, upsert).
9. Fix lint 1 : `tenant.middleware.ts` augmentation via `namespace Express` global (résout `@types/express-serve-static-core` introuvable).
10. Fix lint 2 : `exactOptionalPropertyTypes` strict → spread conditionnel `...(x !== undefined ? { field: x } : {})` à la place de `field: x ?? undefined`.
11. Fix lint 3 : `seed.ts` inclus dans `tsconfig.json` (`prisma/**/*.ts`), catch Promise typé `(error: unknown)`.
12. DoD validée : typecheck ✓, lint ✓, format:check ✓, test ✓ **26/26** (6 mock + 10 shared + 4 domain + 8 api : 1 health + 4 tenant-context + 3 tenant-middleware).

### Livrables

- `apps/api/prisma/schema.prisma` (18 modèles, 13 enums)
- `apps/api/prisma/migrations/20260421180913_init/migration.sql`
- `apps/api/prisma/seed.ts`
- `apps/api/src/infrastructure/db/prisma.ts`
- `apps/api/src/shared/context/tenant-context.ts` + test
- `apps/api/src/shared/middleware/tenant.middleware.ts` + test
- `apps/api/package.json` : scripts `prisma:generate`, `prisma:migrate`, `prisma:seed`, `db:reset`
- `package.json` racine : `pnpm.onlyBuiltDependencies` (esbuild, prisma)

### Décisions

1. **Augmentation Express via `namespace Express` globale** — raison : le chemin `express-serve-static-core` échoue en strict parce que ses types sont transitive et pas toujours résolvables ; la forme globale `namespace Express { interface Request }` est le pattern canonique recommandé par @types/express.
2. **`exactOptionalPropertyTypes: true` gardé malgré la contrainte** — raison : évite les bugs subtils où `undefined` explicite passe pour "absent". Coût : spread conditionnel. Gain : le type-system garantit qu'on ne confond pas les deux.
3. **Seed idempotent (upsert/findFirst + create)** — raison : permet `pnpm --filter @interim/api prisma:seed` répété sans casser la DB. La RateCard upsert sur id composite a échoué (UUID malformé) → fallback findFirst + create.
4. **`pnpm.onlyBuiltDependencies` pour esbuild + prisma** — raison : postinstall scripts nécessaires (generate du binaire natif) ; pnpm v10 les bloque par défaut pour sécurité. Liste explicite = whitelist auditée.
5. **Pas d'auth wiring concret** — raison : `tenantMiddleware` attend `req.user` posé en amont ; le middleware d'auth (JWT Firebase) arrive en A0.6 (différé BLOCKER-004). Le pattern est prêt, il suffira de brancher.

### Dettes ouvertes (nouvelles)

- [ ] DETTE-010 : wrapper Prisma avec middleware qui injecte `where: { agencyId }` sur toute query (CLAUDE.md §3.5). À faire avant A1.1.
- [ ] DETTE-011 : tests d'intégration Prisma (Testcontainers Postgres) vérifiant isolation cross-tenant réelle. À faire avant A1.1.
- [ ] DETTE-012 : ajouter un container `api` dans docker-compose pour test E2E complet webhook → api → db (bouge DETTE-005 d'un cran).

### Prochain prompt suggéré

- **Fin sprint A.0** : A0.4 (hosting) et A0.6 (auth) bloqués externe. Je m'arrête ici — le fondateur doit :
  1. Créer le tenant Firebase ou Supabase (BLOCKER-004) + ADR-0003
  2. Commander l'hébergement Infomaniak/Exoscale (BLOCKER-003) + ADR-0002
  3. Appliquer branch protection sur main (DETTE-007)
- Dès que BLOCKER-004 levé, reprendre avec `A0.6-auth-firebase-setup` puis sprint A.1 (`A1.1-worker-entity-crud`).

### Métriques

- Fichiers créés : 8 (schema + migration + seed + 4 src + prisma factory)
- Lignes schema.prisma : 480
- Entités modélisées : 18 (tous les modèles §4.1 brief + idempotence webhooks)
- Tests nouveaux : 7 (4 tenant-context + 3 tenant-middleware)
- Total tests repo : **26** (vs 19 avant A0.5)

---

## Session 2026-04-21 20:25 — Prompt A0.3 CI GitHub Actions

- **Opérateur** : Claude Code (Opus 4.7) — déclencheur : user (mode autonome)
- **Prompt** : `A0.3-ci-github-actions`
- **Sprint** : A.0
- **Branche** : `feat/A0.3-ci-github-actions`
- **Dépendances** : A0.1 ✅, A0.2 ✅ (PR #2 mergée, stack compose disponible pour CI integration tests)
- **Objectif** : workflows CI lint/typecheck/test + scan sécu + release tag, dependabot, CODEOWNERS, PR template GitHub.

### Déroulé

1. `.github/workflows/ci.yml` : 5 jobs parallélisés (lint+format, typecheck, test-unit, smoke-compose, audit). `smoke-compose` attend les healthchecks puis lance `scripts/smoke-test.sh`. `audit` non-bloquant (`|| true`) tant que Dependabot n'a pas purgé le fond.
2. `.github/workflows/trivy.yml` : scan hebdo (lundi 05:00 UTC) — FS bloquant sur HIGH/CRITICAL, image mock-moveplanner informatif.
3. `.github/workflows/release.yml` : trigger tag `v*.*.*`, build+push image mock vers `ghcr.io`, GitHub Release auto avec release notes générées.
4. `.github/dependabot.yml` : npm hebdo (groupé : dev-tooling, typescript, test-tooling), github-actions hebdo, docker hebdo.
5. `.github/CODEOWNERS` : @kreuille en global, zones conformité/MP/infra scopées.
6. `.github/PULL_REQUEST_TEMPLATE.md` : copie strict de `docs/pr-template.md` (même contenu, GitHub exige qu'il soit dans `.github/` pour être auto-appliqué).
7. `docs/github-branch-protection.md` : doc d'opération pour le fondateur — configuration requise sur `main` avec script `gh api` prêt à copier-coller.
8. YAML parsés avec js-yaml (via require) — 4/4 valides.
9. `pnpm format` (8 fichiers reformatés), `pnpm lint` vert, `pnpm format:check` vert.

### Livrables

- `.github/workflows/ci.yml` (5 jobs)
- `.github/workflows/trivy.yml`
- `.github/workflows/release.yml`
- `.github/dependabot.yml`
- `.github/CODEOWNERS`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `docs/github-branch-protection.md`

### Décisions

1. **`audit` non-bloquant en CI pour commencer** — raison : à froid, pnpm audit remonte souvent des advisories transitives sans fix ; les traiter PR par PR via Dependabot plutôt que bloquer tout. Durcir plus tard (A0.6 ou A6.6 avant go-live).
2. **Branch protection configurée en ops, pas versionnée** — raison : GitHub ne supporte pas de config declarative ; on documente dans `docs/github-branch-protection.md` avec script `gh api` reproductible. Alternative rejetée : settings-as-code via [github/safe-settings](https://github.com/github/safe-settings) — surdimensionné pour une seule org.
3. **Trivy FS bloquant HIGH/CRITICAL, Trivy image non-bloquant** — raison : les vulns dans les images de base (node:20-alpine) évoluent vite et bloquer tout le run pour une CVE de libc mettrait la main à l'arrêt. On garde visibilité sans bloquer.
4. **Pas de job E2E pour l'instant** — raison : aucune app web ne sert encore de feature testable. Arrive en A1.7 (admin UI) puis A3.6 (dashboard).

### Dettes ouvertes (nouvelles)

- [ ] DETTE-007 : appliquer la branch protection sur `main` via `gh api` (action humaine, cf. `docs/github-branch-protection.md`). Sans ça, les workflows CI ne sont pas un vrai gate.
- [ ] DETTE-008 : durcir `pnpm audit` en bloquant (retirer `|| true`) une fois Dependabot a nettoyé le backlog initial.
- [ ] DETTE-009 : ajouter un job `build-api` quand l'app API aura un Dockerfile (A0.4/A0.5).

### Prochain prompt suggéré

- `A0.5-prisma-schema-v0` — effort M, dépend d'A0.1 ✅. A0.4 (hosting CH) est **skip en autonome** : nécessite contrats externes (Infomaniak, DPA, DNS), voir BLOCKER-003 à ajouter. A0.6 (Firebase tenant) idem → BLOCKER-004.

### Métriques

- Fichiers créés : 7
- Workflows : 3 (ci, trivy, release)
- Jobs CI PR : 5
- Durée estimée CI PR : ~4 min (install cache chaud + lint + typecheck + test parallélisés, smoke ~1 min)

---

## Session 2026-04-21 20:00 — Prompt A0.2 docker-compose local

- **Opérateur** : Claude Code (Opus 4.7) — déclencheur : user (mode autonome « continue »)
- **Prompt** : `A0.2-docker-compose-local`
- **Sprint** : A.0
- **Branche** : `feat/A0.2-docker-compose-local`
- **Skills** : `skills/dev/devops-swiss/SKILL.md`, `skills/dev/backend-node/SKILL.md`
- **Dépendances** : A0.1 ✅ (PR #1 mergée)
- **Objectif** : docker-compose (Postgres 16 + Redis 7 + MailHog + mock MP), Makefile, `.env.example`, smoke test.

### Déroulé

1. Branche `feat/A0.2-docker-compose-local` depuis `main` à jour.
2. `docker-compose.yml` : Postgres 16 alpine, Redis 7 alpine, MailHog v1.0.1, mock-moveplanner (build local), tous avec healthchecks. Volumes nommés pour Postgres et Redis. Le mock expose `host.docker.internal:host-gateway` pour pouvoir pousser des webhooks vers l'API locale.
3. `Makefile` : cibles `up`, `down`, `reset`, `restart`, `logs`, `ps`, `smoke`, `install`, `dev`, `typecheck`, `lint`, `test`, `format`.
4. `.env.example` exhaustif (API, DB, Redis, SMTP MailHog, MovePlanner mock, Firebase placeholder, object storage placeholder). Aucune valeur sensible.
5. `apps/mock-moveplanner/` nouveau workspace : Express 4, 6 endpoints stubbés (workers, availability, assignment response, timesheet sign, timesheet list, emit-webhook admin), signature HMAC-SHA256 sortante avec secret `dev-mock-secret`, 4 tests Vitest + Supertest.
6. Dockerfile : première tentative avec `pnpm build` a échoué (tsconfig inclut les tests, tsc émettait des choses inattendues). Pivot sur runtime `tsx` direct (cohérent avec le pattern dev du repo, `pnpm dev` utilise tsx aussi). Build Docker passe en ~10 s.
7. `scripts/smoke-test.sh` bash : Postgres `pg_isready`, Redis `ping`, MailHog UI 8025, mock MP `/health`.
8. `docs/dev-setup.md` : guide complet (pré-requis, services, tableau des ports, troubleshooting, note Windows `choco install make`).
9. README racine : lien vers `docs/dev-setup.md` et TL;DR.
10. Fix lint itération 1 : `req.body` d'Express typé `any` → narrowing par `typeof === 'object' && 'slots' in body` ; handler `async` → Promise-returning handler remplacé par `.then/.catch` pour éviter `no-misused-promises`.
11. Fix lint itération 2 : `any` résiduel sur le spread `echo: req.body` → intermédiaire `const echo: unknown = req.body`.
12. `docker compose config --quiet` ✓, `docker compose build mock-moveplanner` ✓ (10 s), `docker compose up -d` ✓ (4 services), smoke test **4/4 verts** en ~13 s après démarrage.

### Livrables

- `docker-compose.yml`
- `Makefile`
- `.env.example`
- `scripts/smoke-test.sh`
- `apps/mock-moveplanner/{package.json, tsconfig.json, vitest.config.ts, Dockerfile, .dockerignore}`
- `apps/mock-moveplanner/src/{main,app,hmac,app.test}.ts`
- `docs/dev-setup.md`
- `README.md` mis à jour (lien dev-setup + TL;DR)

Tests nouveaux : 4 (mock MP). Total repo : **19 tests / 5 fichiers / 5 packages**.

### Décisions

1. **Runtime `tsx` dans le container mock plutôt que build `tsc` → `node`** — raison : le mock est un outil de dev, pas une image prod ; éviter un build step qui doublonne le flow `pnpm dev`. Cohérent avec `apps/api/package.json` qui utilise déjà tsx en dev.
2. **Pas d'API container dans docker-compose pour l'instant** — raison : `pnpm dev` lance l'API en local avec hot reload, c'est plus confortable en dev. Le container API arrivera en A0.3 (build CI) et sera wired dans le compose en A0.4 (staging/prod).
3. **`host.docker.internal:host-gateway` pour le mock → API locale** — raison : permet aux webhooks simulés de joindre l'API qui tourne sur l'hôte, compatible Docker Desktop et Linux (via `extra_hosts`).
4. **Scripts smoke en bash, pas en TypeScript** — raison : un dev peut copier-coller le script sans dépendre du build TS. Cohérent avec les scripts d'ops habituels.

### Dettes ouvertes (nouvelles)

- [ ] DETTE-005 : ajouter un container `api` au docker-compose pour tester le pipeline complet webhook (mock → api). À faire en A0.3 quand l'image Docker de l'API existera.
- [ ] DETTE-006 : le mock ne couvre pas *tous* les endpoints MovePlanner listés dans `docs/02-partners-specification.md`. Les compléter au fil des sprints (A3 pour webhooks entrants, A4 pour timesheets).

### Prochain prompt suggéré

- `A0.3-ci-github-actions` — effort M, dépend uniquement d'A0.1 ✅. Permet de sécuriser main avant qu'elle ne reçoive plus de commits.

### Métriques

- Fichiers créés/modifiés : 13
- Durée build Docker image mock : ~10 s
- Durée `docker compose up -d` → healthy : ~13 s (< 30 s DoD ✓)
- Smoke test : 4/4 verts
- Nouveaux tests : 4 (mock app)

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
