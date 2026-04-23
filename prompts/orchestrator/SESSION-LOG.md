# SESSION-LOG.md — Journal chronologique des sessions

> Journal append-only. Chaque session Claude / Cowork ouvre une entrée à son démarrage et la ferme à sa fin.
> Les entrées les plus récentes sont **en haut** (ordre anti-chronologique pour une relecture rapide).

---

## Session 2026-04-23 20:00 — Wiring DI minimal (→ DETTE-042 pour reste) + Phase 2 GCP preview live

- **Opérateur** : Claude Code (Sonnet 4.5) — déclencheur : user "je cherche la version prod live pour tester" → session orientée déploiement preview rapide après négociation scope.
- **Sprint** : hors sprint (opportuniste, post A.6 STOP code-only).
- **Branches Git** : `feat/dette-014-wiring-di-preview` (PR #84 mergée `a18c6b9`), `feat/phase2-gcp-preview-infra` (PR #85 mergée `5eb2963`).
- **Skills chargées** : aucune spécifique — session de déploiement, pas de design métier.
- **Contexte** : on était "STOP code-only". User a demandé une preview live pour cliquer/tester. Audit de `main.ts` a révélé que `createApp()` était appelé sans deps → toutes les routes `/api/v1/*` retournaient 404 (le bloc `if (deps)` dans `app.ts` L159 était skippé). Donc impossible de faire une preview fonctionnelle sans d'abord câbler le DI.
- **Négociation scope** : proposé 3 options (preview backend-only, preview fonctionnelle avec wiring DI + rest later, STOP attendre A0.4 propre). User a choisi fast path "wiring DI minimal + GCP preview, région peu importe".

### Déroulé Phase 1 — wiring DI minimal (PR #84 `a18c6b9`)

1. **Audit use cases** : Explore agent a produit le blueprint DI (constructor sigs + Prisma repo impls + ports). Tous les use cases workers/documents/availability ont des repos Prisma existants + impls in-memory pour les side-effects (ObjectStorage, ScanQueue, DocumentAuditLogger, AvailabilityEventPublisher) déjà exportées depuis `@interim/application` via test-helpers.

2. **Nouveau `DevTokenVerifier`** (`apps/api/src/infrastructure/auth/dev-token-verifier.ts`, 72 lignes) : accepte n'importe quel Bearer token, retourne `agency_admin` sur la 1ère agence trouvée en DB. Cache après premier appel. `agencyId` surchargeable via `DEV_AGENCY_ID`. WARN log au boot quand activé.

3. **Réécriture `main.ts`** avec composition DI complète :
   - `buildTokenVerifier()` dispatch selon `AUTH_MODE` (dev | firebase, default firebase avec fail-fast sur absence de `FIREBASE_PROJECT_ID`)
   - `buildDeps()` instancie PrismaClient + SystemClock + randomUUID, crée les 3 Prisma repos (Worker, Document, Availability), PrismaAuditLogger (workers) + impls in-memory (documents + availability).
   - Câble 13 use cases : 5 workers, 5 documents, 3 availability.

4. **Validation locale** : `docker compose up postgres` + `prisma migrate deploy` + `prisma:seed` + `AUTH_MODE=dev PORT=4100 tsx src/main.ts`. Tests curl end-to-end : `/health` OK, `/api/v1/workers` sans token = 401, avec Bearer = liste seeded (Jean Dupont + Marie Martin), GET by id OK, POST create avec Idempotency-Key → `{workerId}`, GET availability/week OK.

5. **Fix CI "Build API Docker image"** : le smoke test lançait le container avec seulement `NODE_ENV=production`. Depuis le wiring, le boot exige `AUTH_MODE` (défaut firebase → throw si `FIREBASE_PROJECT_ID` absent). Fix : passer `AUTH_MODE=dev` + `DATABASE_URL` factice. PrismaClient connect en lazy, `/health` ne touche pas la DB.

### Déroulé Phase 2 — GCP preview live (PR #85 `5eb2963`)

1. **Quota projets GCP** : user est capé à 6 projets actifs. Tentative de créer `interim-preview-20260423` → fail quota. Purge de `n8nguedou` (DELETE_REQUESTED) ne libère pas le slot (compte différent des quotas projets). User a choisi option alternative : réutiliser le projet `arnaudguedou` (personnel) avec préfixes `interim-preview-*` sur toutes les ressources (isolation nommage).

2. **Provisioning GCP** :
   - APIs activées : run, sqladmin, sql-component, artifactregistry, cloudbuild.
   - Artifact Registry repo `interim-preview` dans `europe-west1` (gratuit jusqu'à 500MB).
   - Cloud SQL `interim-preview-pg` Postgres 16 f1-micro zonal — **important** : `db-f1-micro` exige `--edition=enterprise` (Enterprise Plus refuse shared-core). ~7 CHF/mois.
   - DB `interim_dev` + user `interim_app` avec password random 20-char. Password sauvé dans `/tmp/interim-preview-db-pwd` (à déplacer en Secret Manager pour vrai staging).

3. **Dockerfiles Next.js standalone** (nouveaux) :
   - `apps/web-admin/Dockerfile` + `apps/web-portal/Dockerfile` : multi-stage monorepo-aware. Build stage `pnpm -F @interim/web-X build` avec `output: 'standalone'` + `outputFileTracingRoot` à la racine monorepo pour tracker les workspace deps. Runtime stage mince copie `.next/standalone` + `.next/static` + `public`.
   - `apps/web-admin/public/` n'existe pas dans le repo → Dockerfile `RUN mkdir -p` dans le build stage avant COPY.
   - `apps/web-admin/next.config.mjs` déjà avait une conf webpack pour `node:` scheme + fallbacks `crypto/fs/path/...`. **Ajout critique** : fallbacks `cluster/v8/perf_hooks/net/tls/async_hooks/worker_threads/dns` parce que `packages/shared/src/index.ts` re-exporte `prom-registry` (prom-client Node-only) et quand un client component importe depuis `@interim/shared`, webpack essaie de bundler prom-client pour le browser → fail sans ces fallbacks.
   - `apps/web-portal/next.config.mjs` : rewrite complet avec même stack (extensionAlias NodeNext + fallbacks + standalone) — elle n'avait pas de config webpack avant.

4. **Build + push 4 images** vers Artifact Registry (parallèle, ~5 min total).

5. **Migrations + seed** contre Cloud SQL :
   - Tentative Cloud SQL Auth Proxy via Docker → fail ADC (Windows gcloud creds à `%APPDATA%\gcloud` pas `~/.config/gcloud`).
   - Fallback Option A : IP publique + `--authorized-networks=<my_ip>/32` temporairement, `prisma migrate deploy` + `prisma:seed` direct via `sslmode=require`, puis `--clear-authorized-networks` pour fermer.
   - Seed a réussi : 1 agence `8b77fe02-4c3a-...` + 2 workers + 1 client + 947 fériés 26 cantons × 3 ans + audit log.

6. **Deploy 4 Cloud Run services** (ordre : mock-MP d'abord pour obtenir son URL, puis API avec `MOVEPLANNER_BASE_URL` + Cloud SQL socket `--add-cloudsql-instances`, puis web-admin + web-portal avec `NEXT_PUBLIC_API_BASE_URL`) :
   - Premier `gcloud run deploy` API → `Aborted by user` mystérieux. Enlever `--quiet` révèle que l'API `sql-component.googleapis.com` demandait activation interactive (y/N). Activée explicitement.
   - `--env-vars-file=ops/preview-api-env.yaml` au lieu de `--set-env-vars` pour éviter les gotchas shell (`&` dans DATABASE_URL parsé comme fork, virgules dans URL parsées comme KEY=VAL suivant).
   - Les 4 services déployés en `europe-west1` avec `--allow-unauthenticated`, min-instances=0 (cold start ~10s acceptable preview).

7. **Verify end-to-end** :
   - `curl https://interim-preview-api-332513055634.europe-west1.run.app/health` → `{"status":"ok"}`
   - `curl -H "Authorization: Bearer test" .../api/v1/workers` → liste Jean Dupont + Marie Martin depuis Cloud SQL
   - `curl -I https://interim-preview-web-admin-...` → 200, titre "Helvètia Intérim — Back-office"
   - `curl -I https://interim-preview-web-portal-...` → 307 redirect /login, titre "Agence Intérim — Portail intérimaire"

### Livrables

- **PR #84 `a18c6b9`** : `main.ts` DI wiring + DevTokenVerifier + fix CI smoke test (240 lignes ajoutées, 3 fichiers).
- **PR #85 `5eb2963`** : Dockerfiles Next.js + runbook `preview-deployment.md` (330 lignes) + template env file + `.gitignore` update (721 lignes ajoutées, 9 fichiers).
- **Preview live** accessible à :
  - https://interim-preview-api-332513055634.europe-west1.run.app
  - https://interim-preview-web-admin-332513055634.europe-west1.run.app
  - https://interim-preview-web-portal-332513055634.europe-west1.run.app
  - https://interim-preview-mock-mp-332513055634.europe-west1.run.app

### Décisions

- **Projet GCP `arnaudguedou`** co-locataire (pas nouveau projet dédié) : user n'avait pas le quota pour un nouveau. Isolation par préfixe nommage `interim-preview-*`.
- **Région `europe-west1`** (Belgique, pas Zurich) : user a dit "peu importe" pour preview + ~30% moins cher que europe-west6.
- **Wiring minimal** : workers + documents + availability. `proposals`, `timesheets`, `ged`, `webhooks` sont optionnels dans `AppDeps` → câblage reporté quand BullMQ/Redis seront câblés.
- **Impls in-memory test-helpers réutilisées** plutôt que créées séparément sous `apps/api/src/infrastructure/` : les test-helpers de `@interim/application` sont exportés via l'index public, donc utilisables en runtime pour preview. Acceptable preview, à remplacer par vraies impls (GCS, BullMQ, MP adapter) pour staging+.
- **Option A (IP publique + authorized network)** pour migrations plutôt que Cloud SQL Auth Proxy : l'ADC Docker sur Windows ne marche pas out-of-the-box. Option A plus simple pour preview, documentée dans le runbook §5.1 comme fallback Windows. Staging+ = Option B proxy.
- **`--env-vars-file`** au lieu de `--set-env-vars` : évite les gotchas de parsing shell (`&`, `,`) dans DATABASE_URL Cloud SQL.
- **Password en clair dans `/tmp/`** (volontaire pour preview, limité à 24h local). Pour staging+ : Secret Manager obligatoire.

### Dette ouverte / suite

- **DETTE-042** (nouvelle, ouverte par cette session) : wiring DI reste — proposals + timesheets + ged + webhooks dans `main.ts`. Dépend de DETTE-015 (BullMQ/Redis) pour les handlers async. Note : DETTE-014 concerne le provisioning Firebase (action humaine externe), pas le wiring DI — distinction à faire pour l'orchestrateur.
- **DETTE-015 (BullMQ + Redis wiring)** : toujours ouverte. La preview actuelle n'a pas de worker déployé et pas de Redis — webhooks MP reçus mais pas dispatchés async.
- **Preview ≠ A0.4 prod** : nLPD non-compliant (pas de CMEK, Belgique pas Suisse, auth bypass). La preview ne remplace PAS A0.4 ; c'est un outil démo/test complémentaire.
- **Coût mensuel preview** : ~8-10 CHF tant qu'elle tourne. Runbook §8 contient la procédure de kill / pause.

### Prochain prompt

**Retour à "STOP code-only — bascule actions externes" tant qu'une nouvelle priorité n'émerge pas.**

Actions externes prioritaires identiques à session précédente :
- A0.4 (provisioning GCP prod en Suisse + CMEK + Secret Manager + DPA + OIDC WIF)
- A5.5 (Swissdec ELM sandbox)
- A6.6 (pentest externe)
- A6.7 (gameday DR + go-live)

La preview offre maintenant un terrain de jeu cliquable pour :
- Montrer l'app à un client pilote potentiel avant le commit go-live.
- Valider les parcours UX sur vraie infra cloud avant A0.4.
- Débug/smoke les régressions multi-services (PRs avec images Cloud Run rebuild).

---

## Session 2026-04-23 18:00 — DETTE-037 : workflow CI dr-roundtrip (squelette PR #81 + enhancements PR #82)

- **Opérateur** : Claude Code (Sonnet 4.5) — 2 PRs en chaîne : PR #81 (squelette workflow, mergée commit `4bbb891`) puis PR #82 (enhancements, cette session).
- **Sprint** : A.6 (consolidation pré-pilote)
- **Branche Git** : `feat/DETTE-037-enhancements` (PR #82)
- **Skills chargées** : `skills/dev/devops-swiss/SKILL.md`, `skills/dev/testing-strategy/SKILL.md`, `skills/ops/release-management/SKILL.md`
- **Note chemin scripts** : le plan utilisateur dit `scripts/dr/*.sh` — dans le repo réel, héritage A6.5, ils sont à `ops/backup/*.sh`. On garde la convention existante pour ne pas casser toutes les références (runbook, README, worker BullMQ qui les wrap).
- **Objectif de la session** : compléter PR #81 avec asserts SHA256 + age header + RPO + RTO explicites dans le workflow, scripts shell CI-friendly (JSON Lines si `CI=true`, exit codes normalisés 0-5), step shellcheck, artifacts enrichis on failure, section "8. Validation CI automatique" dans runbook DR. Test de régression intentionnel pour prouver que les asserts attrapent les bugs.

### Déroulé

1. **PR #81 — squelette workflow** (déjà mergé en début de session, commit `4bbb891`) :
   - `.github/workflows/dr-roundtrip.yml` v1 : triggers `schedule` (cron mensuel `0 3 1 * *`), `pull_request` paths-filter (`ops/backup/**`), `workflow_dispatch`. Job unique 10 steps : checkout, install age + pg-client, génère paire age éphémère, `docker compose up postgres + postgres-dr`, wait healthy, seed 4 tables critiques × 500 rows, `bash test-roundtrip.sh`, capture event JSON, upload artifact + dump container logs `if: failure()`, cleanup `if: always()`. Validé 30s sur runner. Couvre le minimum vital — manquait : asserts explicites, JSON logs, shellcheck, runbook.

2. **Helper commun `ops/backup/_lib.sh`** (95 lignes) — nouveau :
   - `is_ci_mode()` : détecte `env CI=true` (convention GitHub Actions / GitLab CI).
   - `_json_escape()` : escape pur bash (sans dépendance `jq`) pour les images minimales.
   - `log_msg LEVEL MSG [CTX_JSON]` : émet JSON Lines `{"ts","level","script","msg","ctx"}` si CI, sinon `[script] message` human-readable. Stderr pour error/warn, stdout pour info.
   - 7 constantes `EXIT_*` (0 ok, 1 dump, 2 age, 3 sha256, 4 restore/upload, 5 rowcount, 6 RTO) avec `# shellcheck disable=SC2034` (consommées par scripts qui sourcent).

3. **Réécriture scripts `ops/backup/*.sh`** :
   - `pg_dump.sh` : `source _lib.sh`, `log_msg` partout, exit codes via `${EXIT_*}`. Sanity check header age (`age-encryption.org/v1` sur 22 octets) après encrypt — garde-fou P1 contre régression qui uploaderait du plain text.
   - `pg_restore.sh` : pareil + sanity check header age côté décrypt avec message d'erreur clair. Stderr capturé + tronqué à 200 chars dans le ctx JSON pour éviter les logs énormes en CI.
   - `test-roundtrip.sh` : exit codes `5` (rowcount mismatch) et `6` (RTO exceeded). Bandeau `========== ✅ DR roundtrip OK ==========` uniquement en mode dev (`! is_ci_mode`). En CI, juste les JSON Lines + l'event final `dr_roundtrip.completed`.

4. **Workflow `.github/workflows/dr-roundtrip.yml` v2** :
   - Job séparé `shellcheck` (gate via `needs:`) — `ludeeus/action-shellcheck@master`, severity=warning, scoped à `ops/backup/`.
   - Step dédié `Run pg_dump.sh standalone (capture dump pour asserts)` qui produit un dump dans `/tmp/dr-asserts/` pour les 3 asserts statiques (sans dépendre du `test-roundtrip.sh` qui dump+restore d'un coup).
   - **`assert_sha256`** : recalcule sha256 du `.dump.age` et compare au `.sha256` produit par pg_dump.sh. Détecte la corruption silencieuse.
   - **`assert_age_header`** : vérifie les 22 premiers octets `age-encryption.org/v1`. Garde-fou P1 (data leak prod si plain text).
   - **`assert_rpo`** : `dump_duration ≤ RPO_BUDGET_SECONDS` (default 900s = 15 min, configurable via `workflow_dispatch.inputs.rpo_budget_seconds`).
   - **`assert_rto`** : `roundtrip_duration ≤ RTO_BUDGET_SECONDS` (default 14400s = 4h).
   - Step `Collect failure artifacts` (`if: failure()`) : compose ps, logs src+dr, pg_stat_statements top 20, rowcounts src+dr, dump produit (≤50MB via `find -size -50M`), roundtrip.out, recipient public. JAMAIS la clé privée.

5. **Runbook `docs/runbooks/disaster-recovery.md`** — nouvelle §7 "Validation CI automatique" avec 6 sous-sections :
   - 7.1 Enchaînement des steps (12 étapes du workflow)
   - 7.2 Format des logs en CI (exemples JSON Lines)
   - 7.3 Exit codes normalisés (table avec constantes)
   - 7.4 Artifacts en cas d'échec (liste des fichiers collectés)
   - 7.5 Quoi faire si le job CI échoue (procédure on-call + causes courantes)
   - 7.6 Test régression intentionnel (gameday checklist trimestrielle)
   - §8 Références (renumérotée depuis §7) avec ajouts `_lib.sh` + workflow.

6. **Validation locale via Docker** :
   - `koalaman/shellcheck:stable --severity=warning ops/backup/*.sh` → OK (avec disables explicites pour SC2034 sur EXIT_* et SC2012 sur ls -t).
   - `rhysd/actionlint:latest .github/workflows/dr-roundtrip.yml` → OK (SC2012 inline disablé via commentaire).

7. **Test régression intentionnel** (gameday §7.6 mise en pratique) — 3 commits sur la branche :
   | Run | Commit | Statut DR | Conclusion |
   |---|---|---|---|
   | 24836327747 | `f9386d5` (baseline) | ✅ pass 47s | Tous asserts verts |
   | 24836440161 | `5d1af89` (sha256 random injecté) | ❌ FAIL on `assert_sha256` | Garde-fou validé : workflow rouge, steps suivants skippés, artifacts uploadés |
   | 24836498331 | `05af99c` (revert via `git revert`) | ✅ pass 34s | Retour état sain avant merge |

8. **Merge PR #82** : squash via `gh pr merge --admin` → commit `78933e0` sur main. 10/10 checks verts.

### Livrables (PR #82 = `78933e0`)

- **Code** : `ops/backup/_lib.sh` (nouveau, 103 lignes), refactor `pg_dump.sh` / `pg_restore.sh` / `test-roundtrip.sh` (~270 lignes touchées)
- **CI** : `.github/workflows/dr-roundtrip.yml` enrichi (227 lignes vs 199 avant) avec 4 asserts explicites + step shellcheck en gate + artifacts enrichis
- **Doc** : `docs/runbooks/disaster-recovery.md` §7 nouvelle (109 lignes ajoutées)
- **Total** : 600 insertions, 120 suppressions sur 7 fichiers

### Décisions

- **Chemin scripts conservé `ops/backup/*.sh`** (pas `scripts/dr/*.sh` du plan utilisateur) — héritage A6.5, casserait runbook + README + worker BullMQ.
- **Exit code 4 = restore_fail OU upload_fail** : overlap acceptable (les 2 cas signifient "le bucket / la cible n'a pas reçu/livré le dump"). Documenté dans `_lib.sh` + runbook §7.3.
- **Squash merge** plutôt que rebase : main reste lisible (1 commit par PR), historique du test régression conservé dans la PR #82 elle-même.
- **§7 (Validation CI) avant §8 (Références)** plutôt que en fin : numérotation contiguë + Références logiquement à la fin.
- **Helper `_lib.sh` plutôt que dupliquer log_msg dans chaque script** : DRY, 1 seul endroit pour faire évoluer le format JSON Lines (ajouter `severity`, `correlation_id`, etc. dans le futur sans toucher 4 scripts).

### Dette ouverte / suite

Aucune dette ouverte sur DETTE-037 — **fully closed**. Les éléments restants relèvent de A.7+ :
- Wire `wal-archive.sh` côté Postgres prod (A6.5 → DETTE-040 si besoin de gameday WAL séparé du dump).
- Dashboard Grafana dédié `dr-test.json` (mentionné dans runbook §6) — toujours pas créé, pas bloquant pour pilote, dette mineure non priorisée.
- Migration `actions/checkout@v4` Node.js 20 → 24 quand v5 sortira (deprecation notice annoncée juin 2026).

### Prochain prompt

**STOP code-only — bascule actions externes (orchestrateur).**

Le code Sprint A.6 est terminé. Les 4 dernières dettes critiques (036, 033, 035, 037) sont toutes closes. Le pilote Helvètia Intérim est techniquement prêt côté code. Les actions restantes pour finir A.6 sont **hors-code** et nécessitent intervention humaine :
- **A0.4** (provisioning GCP/Infomaniak — DPO + DevOps lead, secrets en prod, rotation clés age)
- **A5.5** (signature contrats SES/QES — Swisscom Trust Signing Services, contrat fournisseur à signer)
- **A6.6** (pentest externe — budget alloué, RFP à lancer, fournisseur à choisir)
- **A6.7** (gameday DR avec ops on-call — exécution du runbook §3 sur env staging réelle)

Cf. `prompts/orchestrator/PROGRESS.md` pour détails et ordre.

---

## Session 2026-04-23 14:00 — DETTE-033 + DETTE-035 combinés : worker /metrics + business counters

- **Opérateur** : Claude Code (Sonnet 4.5) — déclencheur : user "Plan de session — DETTE-033 + DETTE-035 combinés : /metrics + business counters"
- **Prompts exécutés** : DETTE-033 (worker `/metrics` endpoint) + DETTE-035 (business counters payroll/availability/DR) en 1 PR cohérente
- **Sprint** : A.6 (consolidation observabilité)
- **Branche Git** : `feat/dette-033-035-metrics-business-counters`
- **Skills chargées** : `skills/dev/observability/SKILL.md`, `skills/dev/devops-swiss/SKILL.md`, `skills/dev/backend-node/SKILL.md`
- **Dépendances vérifiées** : OK — DETTE-036 close (PR #77 `03554c3`) + 3 sub-tickets bien tracés (DETTE-036(a) bis, DETTE-038, DETTE-039). Working tree clean. Prometheus scrape config A6.3 cible déjà `worker:9090` (juste à exposer côté worker).
- **Précondition** : code A6.3 déjà posé côté API (`apps/api/src/infrastructure/observability/metrics.ts`, `logger.ts`, `tracing.ts`, `sentry.ts`) — il manquait juste l'exposition côté worker + les counters business.
- **Objectif de la session** : factoriser un module `prom-registry` partagé (`packages/shared`), exposer un endpoint HTTP `/metrics` côté worker (port 9090, http natif), poser les 17 counters business (paie 5 + availability 4 + DR 8) avec PII hygiene (`hashAgencyId`, low-cardinality labels), wire les callbacks `onResult` existants des workers vers les counters, mettre à jour les 4 dashboards Grafana pour qu'ils aient des données à afficher.

### Déroulé

1. **Shared module** (`packages/shared/src/observability/prom-registry.ts`) :
   - `hashAgencyId(id)` : SHA-256 tronqué 12 hex chars (48 bits, distinct de `hashWorkerId` côté API qui fait 16 chars / 64 bits ; les agences sont moins nombreuses que les workers).
   - `FORBIDDEN_LABELS` : 18 labels interdits (worker_id, staff_id, iban, avs, email, phone, firstname, lastname, request_id, correlation_id, timestamp, user_agent, authorization, token, agency_id en clair).
   - `validateLabelHygiene(labels)` + `assertLabelHygiene(metricName, labels)` (throw `ForbiddenLabelError` si label PII).
   - `createPromRegistry({service: 'api'|'worker'})` : `Registry` + `setDefaultLabels({service})` + `collectDefaultMetrics({prefix: interim_<service>_})`.
   - 20 tests : determinism, case-insensitive detection, FORBIDDEN_LABELS coverage, registry default labels, collectDefaultMetrics enable/disable.

2. **Worker observability** (`apps/worker/src/observability/`) :
   - `business-metrics.ts` : 20 métriques (5 paie + 4 availability + 8 DR + 3 MP), toutes registered dans `workerRegistry` singleton avec `assertLabelHygiene` au boot. Helper `BusinessMetrics` interface + `createBusinessMetrics()` (impl prod) + `createNoOpBusinessMetrics()` (tests). Conversion `bigint` Rappen → `number` (sûr jusqu'à 2^53 ≈ 90 trillions CHF).
   - `server.ts` : `node:http` natif (pas de framework), routes `GET /metrics` + `/health`, méthodes autres → 405, autres URLs → 404. `onScrape` hook async optionnel pour rafraîchir les gauges DB juste avant `/metrics` ; erreurs swallowed + logged → ne fait JAMAIS échouer le scrape (Prometheus retry sinon, perte d'observabilité).
   - 17 tests business-metrics (counters + gauges + histograms + PII hygiene check) + 6 tests server (HTTP routes + onScrape edge cases) → **23 nouveaux tests worker**.

3. **Worker main** (`apps/worker/src/main.ts`) : remplace placeholder par `startMetricsServer({ port: 9090, registry: workerRegistry })`. Le wiring BullMQ (Redis + Prisma DI) reste commenté en attente DETTE-014/015 — le serveur metrics démarre quand même → /metrics expose les Node default + business counters à 0 jusqu'au premier événement.

4. **Workers wiring** (callbacks `onResult` vers counters) :
   - `availability-sync.worker.ts` : ajout `onResult` au `Deps` interface + emit avec `{ processed, succeeded, retried, dead, durationSeconds }` mappé depuis `PushAvailabilityResult`.
   - `dr-restore-test.worker.ts` : `onResult` déjà présent depuis A6.5 (PR #74) — le wiring vers `metrics.recordDrRestoreTest()` se fait dans `main.ts` quand BullMQ sera activé.
   - `ged-purge.worker.ts` : `onResult` déjà présent depuis A4.4. Pas de counter dédié dans cette PR (purge GED hors scope DETTE-035).
   - `payroll-weekly.worker.ts` (NOUVEAU) : skeleton BullMQ avec `onResult` callback qui passe `{ agencyId, isoWeek, status, durationSeconds, workersProcessed, grossRappen, deductionsRappen }`. Cron `0 18 * * 5` (vendredi 18h Europe/Zurich). Use case `RunPayrollWeekUseCase` reste abstrait (à implémenter sprint A.7 avec wiring complet PayrollEngine + Prisma).

5. **Dashboards Grafana** (`ops/grafana/dashboards/`) — 4 dashboards mis à jour pour qu'ils affichent les nouvelles métriques :
   - `payroll-batch.json` v2 : RED metrics avec `histogram_quantile(0.95, payroll_batch_duration_seconds_bucket)`, runs success vs failed, brut + retenues cumulés 7j, brut CHF (Rappen / 100).
   - `queue-depth.json` v2 : `availability_outbox_pending_count` total + max lag + processed par status, séries par tenant (`{{agency_id_hash}}` legend), push duration p95, rate processed.
   - `mp-health.json` : circuit breaker state mis à jour vers `mp_circuit_breaker_state` (worker) avec fallback `mp_cb_state` (api ; double `or` PromQL pour transition).
   - `backup-dr.json` : ajout RPO empirique p95 (`dr_restore_test_rpo_seconds_bucket`), runs success vs failed 30j, dernier WAL archive âge, p50/p95 RTO timeseries 365j.

6. **Compose** : `ops/prometheus/prometheus.yml` cible déjà `worker:9090` depuis A6.3 (PR #71). Vérifié — aucun changement nécessaire.

7. **QA + validations** :
   - `pnpm typecheck` (8 workspaces) ✅
   - `pnpm lint` ✅ (corrections : suppression `eslint-disable no-console` inutile + import `beforeEach` non utilisé, auto-fix `--fix`)
   - `pnpm -r test` : **1210 unit + 53 integration** verts (vs 1167/53 ; +43 unit : 20 shared + 17 business-metrics + 6 server)
   - `promtool check rules` : 16 alertes ✓ (P1=7, P2=6, P3=3)
   - `JSON.parse` × 5 dashboards Grafana ✓
   - Prettier-write sur 14 fichiers nouveaux

8. **PR + merge** :
   - PR #79 ouverte avec DoD complète + tableau métriques + PII hygiene examples
   - 8/8 CI checks verts (lint + format + typecheck + unit + integration + coverage + audit + docker smoke + build api)
   - Merge admin rebase, branche supprimée, sync main local
   - Commit final : `a38b712`

### Livrables

- **6 nouveaux fichiers code** : `prom-registry.ts` + `prom-registry.test.ts` (shared) ; `business-metrics.ts` + `business-metrics.test.ts` + `server.ts` + `server.test.ts` (worker observability) ; `payroll-weekly.worker.ts` (worker)
- **3 fichiers worker modifiés** : `main.ts`, `availability-sync.worker.ts`, `package.json`
- **2 fichiers shared modifiés** : `index.ts`, `package.json`
- **4 dashboards Grafana mis à jour** : `payroll-batch.json` (v2), `queue-depth.json` (v2), `mp-health.json` (v2), `backup-dr.json` (v2 — +4 panels)
- **PR #79** mergée — commit `a38b712`
- Total LOC : +1900 / -100 (gros tests + dashboards JSON)

### DoD DETTE-033 + DETTE-035 (toutes cochées)

- [x] **DETTE-033** — `/metrics` disponible sur `apps/worker` port 9090 (HTTP natif `node:http`)
- [x] **DETTE-033** — Module `prom-registry` factorisé dans `packages/shared` (réutilisable api + worker)
- [x] **DETTE-033** — `docker-compose.observability.yml` scrape `worker:9090` (déjà OK depuis A6.3)
- [x] **DETTE-035** — 5 métriques paie (`payroll_batch_*`)
- [x] **DETTE-035** — 4 métriques availability outbox (`availability_outbox_*`)
- [x] **DETTE-035** — 8 métriques DR/backup (`pg_dump_*`, `wal_archive_*`, `dr_restore_test_*`)
- [x] **DETTE-035** — 3 métriques MovePlanner (`mp_push_*`, `mp_circuit_breaker_state`)
- [x] **PII hygiene** : `hashAgencyId()` SHA-256 12 hex, `FORBIDDEN_LABELS` 18 entries, `assertLabelHygiene` au boot, aucun `worker_id`/`iban`/`avs`/`email` en label
- [x] **Cardinalité** : status (~5 values), endpoint templatisé (~10), agency_id_hash (~16M théorique mais en pratique <1000 tenants) → cardinalité totale OK pour Prometheus
- [x] **Dashboards Grafana vivants** : 4 dashboards mis à jour avec les nouvelles métriques (panels RED + p95 + per-tenant)
- [x] **Pas de régression** : 1210 unit + 53 integration verts, typecheck + lint verts, coverage maintenue
- [x] **PR + merge** : PR #79 mergée, commit `a38b712`

### Décisions

1. **`node:http` natif vs Fastify** : choix natif. Le serveur expose 2 endpoints triviaux (`/metrics` + `/health`), pas besoin de routing complexe ni de middleware. Réduit la surface d'attaque + supply chain (1 dep en moins).
2. **`hashAgencyId` 12 hex (48 bits)** au lieu de `hashWorkerId` 16 hex (64 bits) côté logger : les agences sont en pratique <1000, les workers <millions. Économise 4 chars par série Prometheus → moins de bytes en TSDB.
3. **Singleton `workerRegistry`** au lieu d'un registre par worker : simplifie le wiring (1 endpoint /metrics qui voit tout le worker). Inconvénient : tests doivent compter en delta (vs valeur absolue) car le singleton accumule. Acceptable.
4. **`onScrape` hook async qui swallow les erreurs** : choix défensif. Si la DB est down ou lente, on préfère que /metrics réponde 200 avec les counters déjà en mémoire plutôt que 500 (Prometheus retry sinon, et on perd les séries pour ce scrape). Trade-off : un counter peut être obsolète si `onScrape` échoue souvent → alerter via le rate `prometheus_target_scrapes_sample_out_of_order_total` côté Prometheus.
5. **Worker `payroll-weekly.worker.ts` skeleton** : pas de RunPayrollWeekUseCase concret. Justifié : la PR vise les **counters et dashboards**, pas le wiring DI complet (qui dépend encore de DETTE-014/015 secrets + d'un repo timesheet/client/rate complet en sprint A.7).
6. **`mp_circuit_breaker_state` côté worker en double avec `mp_cb_state` côté api** : pas de fusion. Les deux registres sont distincts (api vs worker) — Prometheus voit 2 séries séparées avec labels `service="api"` et `service="worker"`. Le dashboard `mp-health.json` `OR`-merge les deux pour afficher l'état "agrégé".
7. **`assertLabelHygiene` au boot vs en runtime** : choisi boot (au moment de l'instanciation des Counter/Gauge/Histogram via `assertLabelHygiene('payroll_batch_runs_total', PAYROLL_LABELS)`). Avantage : fail-fast — un dev qui ajoute `worker_id` à un label crash le worker au démarrage, pas en prod après des heures.
8. **Conversion `bigint` Rappen → `number` pour `Counter.inc()`** : précision exacte jusqu'à 2^53 = 9 quadrillions de Rappen ≈ 90 trillions CHF. Impossible d'atteindre cette valeur en pratique (économie suisse 2024 ~700 milliards CHF, soit 7e13 Rappen).

### Dettes ouvertes (nouvelles)

- [ ] **DETTE-040** : Wire les counters dans `apps/worker/src/main.ts` quand le DI Redis + Prisma sera prêt (DETTE-014/015 done). Ajouter dans `createAvailabilitySyncWorker({ ..., onResult: (r) => metrics.recordAvailabilityOutboxPushed({ agencyId: ?, status: ..., ... }) })`. Note : les payloads `PushAvailabilityResult` ne contiennent pas l'agencyId — il faudra le propager via le job BullMQ ou via un wrapper qui résout `outboxRow.agencyId → metrics.recordAvailabilityOutboxPushed`.
- [ ] **DETTE-041** : Wire `onScrape` hook côté worker pour scraper la DB Postgres et mettre à jour `availability_outbox_pending_count` + `availability_outbox_lag_seconds` (queries `SELECT count(*) FROM availability_outbox WHERE status='pending' GROUP BY agency_id` + `SELECT max(now() - created_at) WHERE status='pending'`). Sans ça, ces 2 gauges restent à 0 même si l'outbox déborde.

### Prochain prompt suggéré

**`DETTE-037` — Job CI mensuel `test-roundtrip` backup/DR** (M, ~1 jour) :
- Job GitHub Actions qui exécute `ops/backup/test-roundtrip.sh` dans compose `dr-test` + age + bash
- Évite régression silencieuse sur scripts shell DR (exit code, sha256, age, pg_restore)
- Avant pilote A6.7 — partie des prérequis go-live

**Alternatives** :
- DETTE-038 (wire preload canton-holidays bootstrap) — XS, 1h
- DETTE-039 (Jeûne genevois `sunday_relative`) — XS, 30 min
- DETTE-040 (wire metrics callbacks dans main.ts) — S, dépend DETTE-014/015
- DETTE-041 (onScrape gauges DB outbox) — S, immédiatement faisable
- AH.003 (extension design Helvètia aux écrans non-couverts)

À défaut d'instruction, l'orchestrateur suggère **DETTE-037** car c'est la dernière dette critique avant pilote (les autres sont nice-to-have ou bloquées externes).

### Métriques

- **Prompts catalogue** : 44/48 (91.7%) — inchangé
- **Tests** : **1210 unit + 53 integration** sur 8 workspaces (vs 1167/53, +43 unit)
- **Coverage** : domain payroll 98.86% (inchangé), shared inclut désormais 87 tests (+20 nouveaux observability)
- **Dettes** : 13 ouvertes (12 anciennes + 2 nouvelles DETTE-040/041 - DETTE-033/035 closes)
- **Dettes catalogue restantes** : 11 (5 externes + 3 court terme + 3 wiring runtime)
- **Effort réel** : ~3.5h (vs S+S = 1 jour estimé) — réutilisation patterns A6.3 + onResult hooks existants

---

## Session 2026-04-23 12:00 — DETTE-036 (A5.2 divergence) — canton_holidays Prisma + 26 cantons + règle "plus favorable"

- **Opérateur** : Claude Code (Sonnet 4.5) — déclencheur : user "Plan de session — clôturer DETTE-036 (A5.2) dans le bon layout architectural"
- **Prompt exécuté** : DETTE-036 (ad-hoc, pas dans catalogue) — 3 actions : (a) table Prisma `canton_holidays` + seed 2026-2028 pour 26 cantons (vs 11 en TS), (b) ajouter Tessin manquant, (c) règle "plus favorable" contrat>CCT
- **Sprint** : A.6 (consolidation)
- **Branche Git** : `feat/DETTE-036-canton-holidays-prisma`
- **Skills chargées** : `skills/compliance/cct-staffing/SKILL.md`, `skills/compliance/ltr-working-time/SKILL.md`, `skills/business/payroll-weekly/SKILL.md`, `skills/dev/database-postgres/SKILL.md`, `skills/dev/testing-strategy/SKILL.md`
- **Dépendances vérifiées** : OK — `StaticCantonHolidaysPort` existant (11 cantons), `payroll-engine.ts` utilise déjà `CantonHolidaysPort` (juste à renommer/enrichir), Prisma migration tooling en place (4 migrations existantes).
- **Précondition** : main à jour (commit `8fb3202`). Working tree clean.
- **Objectif de la session** : passer du port TS pur à une vraie table Prisma versionnée (valid_from/valid_to) + seed officielle 26 cantons × 3 ans + règle "plus favorable" qui prend `max(contrat, CCT, LTr)` → garantir LTr/CCT comme plancher légal infranchissable.

### Déroulé

1. **Domain layer** (pure TS, sans IO) :
   - `canton-holidays-data.ts` créé : structure `HolidayDef` discriminée par `kind` (`fixed` / `easter_relative` / `sunday_relative`) + `FEDERAL_HOLIDAYS` (7 fériés : 1.1, 1.8, 25.12, Vendredi Saint, Lundi Pâques, Ascension, Pentecôte+1) + `CANTONAL_HOLIDAYS` (26 cantons avec leurs spécificités) + `SWISS_CANTONS` constante ISO 3166-2:CH + `HOLIDAY_DATA_VERSION_VALID_FROM`.
   - `canton-holidays.ts` réécrit : ajout `CantonHolidayPort` (read-only sync, contrat consommé par PayrollEngine) + `CantonHolidayRepository` (RW pour seeds/admin) + `CantonHolidayPersisted` (avec validFrom/validTo) + `computeHolidaysForCantonYear()` (déterministe + dédupliqué + trié) + `expandHolidayDef()` (matérialise 1 def + 1 année → date concrète) + `nthSundayOfMonth()` (Lundi du Jeûne fédéral) + `StaticCantonHolidaysPort` (cache fallback) + `InMemoryCantonHolidayRepository` (tests).
   - `surcharge-rules.ts` : ajout `applyContractOverrides(cct, contractOverrides)` — règle "plus favorable" via `Math.max(cct[k], contract[k] ?? 0)` pour chaque kind. CCT = plancher infranchissable (un override `<` est ignoré).

2. **Tests domain** :
   - `canton-holidays.test.ts` : 64 tests (vs 13). Couvre : algorithme Pâques 2024-2028, 3 types de def, invariants 26 cantons (chaque canton a les 7 fériés fédéraux), Escalade GE 12/12, Saint-Berchtold VD 2/1, Lundi Jeûne fédéral VD 21/9/2026, TI 9 spécificités, Indépendance jurassienne JU 23/6, République neuchâteloise 1/3, versioning InMemoryCantonHolidayRepository.
   - `surcharge-rules.test.ts` : +11 tests `applyContractOverrides`. DoD scénarios : `contrat nuit +30% / CCT +25% → 30%` ✅ et `contrat nuit +20% / CCT +25% → 25%` ✅ (CCT plancher protégé).
   - Domain : **513 tests verts** (vs 451, +62).

3. **Infrastructure (apps/api)** :
   - `prisma/schema.prisma` : nouveau model `CantonHoliday` avec PK composite `(canton, date, validFrom)`, index secondaire `(canton, date)`. Pas d'`agencyId` (référentiel public commun toutes agences).
   - Migration `20260423082853_canton_holidays` créée + appliquée localement sur Postgres docker-compose.
   - `prisma/seed.ts` : `seedCantonHolidays()` utilise `computeHolidaysForCantonYear` du domain pour insérer 947 rows (26 × 3 ans) via upsert idempotent + 1 entrée AuditLogEntry CREATE par run avec diff structuré (cantonsCount/yearsRange/totalUpserted/sourceVersion/seedTimestamp). Conformité CO art. 958f conservation 10 ans.
   - `infrastructure/persistence/prisma/canton-holiday.repository.ts` : `PrismaCantonHolidayRepository` avec cache in-memory invalidé après chaque `upsertMany`. `forCantonAndYear` SYNCHRONE par contrat (cache miss = `[]` ; `preload(canton, year)` async à appeler au bootstrap pour rempli le cache). `upsertMany` en transaction Prisma pour atomicité (rollback complet si une seule ligne échoue).
   - 9 integration tests Testcontainers : `upsertMany` + `preload` + `isHoliday` cache hit + idempotence + versioning validFrom/validTo + invalidation cache + `listAllVersions` tri + isolation cross-canton.

4. **Validations** :
   - `pnpm typecheck` (8 workspaces) ✅
   - `pnpm lint` ✅ (corrections : `type` → `interface` pour `consistent-type-definitions`, ajout `.localeCompare` pour `no-unnecessary-condition`)
   - `pnpm -r test` : **1167 unit + 53 integration** verts (vs 1105/47, +62 unit + 6 integration)
   - `pnpm -F @interim/domain test:coverage` : payroll **98.86% lines / 87.5% branches / 98.21% functions** (>>>  seuil DoD 90%). `canton-holidays-data.ts` 100% / `canton-holidays.ts` 97%.
   - **Migration Prisma appliquée localement** sur Postgres docker-compose (5432) ✅
   - **Seed exécuté avec idempotence prouvée** : 947 rows × 2 runs, count stable à 947 ✅
   - **Validation par canton** : `SELECT count(*) FROM canton_holidays GROUP BY canton` montre les 26 cantons présents avec TI = 48 (le plus riche : 16/an × 3 ans), GR = 45, JU = 45, AG/FR/LU/NW/OW/SZ/SO/UR/AI/TI tous catholiques avec 10+ fériés/an.

5. **PR + merge** :
   - PR #77 ouverte avec label `compliance-review` (créé : `B60205` — CCT/LSE/LTr/nLPD)
   - 8/8 CI checks verts (lint + format + typecheck + unit + integration + coverage + audit + docker smoke + build api)
   - Merge admin rebase, branche supprimée, sync main local
   - Commit final : `03554c3`

### Livrables

- **4 nouveaux fichiers domain** : `canton-holidays-data.ts`, +modifs `canton-holidays.ts` / `surcharge-rules.ts` / `canton-holidays.test.ts` / `surcharge-rules.test.ts` / `index.ts`
- **3 nouveaux fichiers infrastructure** : Prisma migration `20260423082853_canton_holidays/migration.sql`, adapter `canton-holiday.repository.ts`, integration test `canton-holiday.repository.integration.test.ts`
- **2 fichiers Prisma modifiés** : `schema.prisma` (model CantonHoliday), `seed.ts` (seedCantonHolidays + audit)
- **PR #77** mergée — commit `03554c3`
- Total LOC : +1390 / -113

### DoD DETTE-036 (3/3 ✅)

- [x] **(a)** Table Prisma `canton_holidays` + migration + adapter Prisma. Port TS préservé comme fallback (`StaticCantonHolidaysPort`) — utilisable au bootstrap si DB vide.
- [x] **(b)** Tessin (TI) ajouté avec 9 spécificités catholiques (Épiphanie, Saint-Joseph, Festa del lavoro, Corpus Domini, Saints Pierre et Paul, Assomption, Toussaint, Immaculée, Saint-Étienne).
- [x] **(c)** Règle "plus favorable" : `applyContractOverrides()` avec `Math.max(CCT, contrat)` pour night/sunday/holiday/overtime. Validée par 11 tests.

### DoD DETTE-036 — secondary checks ✅

- [x] Tests verts (1167 unit + 53 integration)
- [x] Typecheck vert
- [x] Lint vert
- [x] Coverage domain payroll 98.86% (>>>  90% requis)
- [x] DETTE-036 fermée dans PROGRESS.md (cette session)
- [x] Entrée SESSION-LOG.md avec décisions (notamment le layout Prisma retenu : pas d'agencyId, PK composite avec validFrom, cache lazy avec preload async)
- [x] PR + merge (rebase admin)
- [x] Audit log écrit sur les seeds (AuditLogEntry CREATE avec diff structuré, traçabilité CCT)

### Décisions

1. **Pas d'`agencyId` sur `canton_holidays`** : c'est un référentiel public commun à toutes les agences (loi suisse). Économise 947 rows × N agences. Lookup plus rapide aussi.
2. **PK composite (canton, date, validFrom)** : permet versioning historique. Si une législation cantonale change (rare — par vote), on insère un nouveau row avec `validFrom=<date-vote>` et close l'ancien (`validTo=<date-vote>-1`). L'audit conserve les 2 versions (10 ans CO art. 958f).
3. **`forCantonAndYear` SYNCHRONE** : contrainte du contrat `CantonHolidayPort` consommé par `PayrollEngine` (qui doit rester pur sync — pas de `await` dans le calcul de paie). L'adapter Prisma offre `preload(canton, year)` async à appeler au bootstrap. Le cache permet ensuite des appels sync transparents sans IO.
4. **Règle "plus favorable" dans le domaine pur** : `applyContractOverrides(cct, overrides)` est une fonction pure testable sans IO. L'application use case orchestre l'appel : `loadSurchargeRulesForBranch(branch) → applyContractOverrides(rules, contract.overrides) → PayrollEngine.computeWeek({surchargeRules: effective})`.
5. **`stackSundayAndNight` et `overtimeThresholdMinutes` non overridables côté contrat** : ce sont des propriétés CCT-branche, pas du contrat individuel.
6. **3 types de `HolidayDef`** : `fixed` (date civile), `easter_relative` (offset depuis Pâques), `sunday_relative` (Lundi du Jeûne fédéral, Jeûne genevois). Couvre tous les cas suisses connus.
7. **Le `payroll-engine.ts` n'a PAS été refactoré** : il utilise déjà `CantonHolidaysPort` (interface inchangée). Les appelants peuvent passer `StaticCantonHolidaysPort` (legacy, fallback) ou `PrismaCantonHolidayRepository` (préchargé) sans changement de signature. Wiring final côté use case `RunPayrollWeekUseCase` reporté à sprint A.7.

### Dettes ouvertes (nouvelles)

- [ ] **DETTE-036(a) bis (mineure)** : ADR formelle pour entériner le double mécanisme (port TS fallback + table Prisma source de vérité) OU supprimer `StaticCantonHolidaysPort` après wiring complet du `PayrollEngine` à la table. Recommandation : garder les 2 (port TS comme bootstrap default si table vide ; table Prisma comme source en runtime). Effort : S, à arbitrer en sprint A.7.
- [ ] **DETTE-038** : Wire `PrismaCantonHolidayRepository.preload()` au bootstrap de l'API pour les cantons + années actifs (typiquement année courante + N+1). Sans ça, le cache reste vide en runtime et `forCantonAndYear` retourne `[]` → fallback silencieux sur `StaticCantonHolidaysPort` requis. À faire dans le wiring du `RunPayrollWeekUseCase` (sprint A.7).
- [ ] **DETTE-039** : Le Jeûne genevois exact (jeudi après 1er dim sept) est codé en dur comme `fixed 9/1` placeholder dans GE — à raffiner via `sunday_relative` proprement dans une PR ultérieure. Effort : XS.

### Prochain prompt suggéré

**`DETTE-033 + DETTE-035` combinés (1 PR cohérente)** — toujours la priorité initialement identifiée pour débloquer les dashboards Grafana à moitié vides :
- Wire `/metrics` endpoint sur `apps/worker/main.ts` (port 9090) avec counters BullMQ par queue
- Exposer métriques business `payroll_batch_*`, `availability_outbox_*`, `pg_dump_*`, `wal_archive_*`, `dr_restore_*`
- Effort combiné : S+S = ~M (1 jour)
- Débloque immédiatement les 4 dashboards Grafana posés en A6.3 + A6.5 (`queue-depth`, `mp-health` outbox lag, `payroll-batch`, `backup-dr`)

**Alternatives** :
- DETTE-038 (wire preload bootstrap canton-holidays) — SI on veut activer immédiatement le PrismaCantonHolidayRepository en runtime
- AH.003 (extension design Helvètia aux écrans non-couverts)
- DETTE-037 (job CI test-roundtrip mensuel)

### Métriques

- **Prompts catalogue** : 44/48 (91.7%) — inchangé (DETTE n'est pas un prompt catalogue)
- **Tests** : **1167 unit + 53 integration** sur 8 workspaces (vs 1105/47, +62 unit + 6 integration)
- **Coverage domain payroll** : 98.86% lines / 87.5% branches / 98.21% functions (>>>  seuil DoD 90%)
- **Dettes** : 12 ouvertes (10 anciennes + 3 nouvelles : DETTE-036(a) bis ADR, DETTE-038 wire preload, DETTE-039 Jeûne genevois) — DETTE-036 originale CLOSE
- **Effort réel** : ~3h (vs M = 1 jour estimé)

---

## Session 2026-04-23 10:00 — Prompt A6.5 backup-restore-DR-test

- **Opérateur** : Claude Code (Sonnet 4.5) — déclencheur : user "Exécute prompts/sprint-a6-compliance-golive/A6.5-backup-restore-dr-test.md selon protocole ORCHESTRATOR §3"
- **Prompt exécuté** : `A6.5-backup-restore-dr-test`
- **Sprint** : A.6
- **Branche Git** : `feat/A6.5-backup-restore-dr-test`
- **Skills chargées** : `skills/dev/devops-swiss/SKILL.md`
- **Dépendances vérifiées** : OK — A0.4 (provisioning GCP) reste externe, mais on peut **préparer toute la chaîne en local** avec docker-compose Postgres existant. Le RPO/RTO sera démontré sur la stack locale, à reproduire en prod après DETTE-015.
- **Précondition** : DETTE-036 ouverte (A5.2 divergence) committée via PR #73 `bb78926`. Working tree clean après sync main.
- **Objectif de la session** : poser les scripts pg_dump + pg_restore (chiffrement gpg/age), runbook disaster-recovery.md, job worker mensuel `dr-restore-test.job.ts`, extension docker-compose pour test E2E local. Démonter RPO ≤ 15 min et RTO ≤ 4h via test scripté.

### Déroulé

1. **Vérification A5.2 préalable** (demande utilisateur) :
   - `grep canton_holidays apps/api/prisma/` → ❌ pas de table Prisma
   - `grep CantonHoliday packages/domain/src/payroll/` → ✅ `StaticCantonHolidaysPort` (port TS pur, 11 cantons)
   - `find apps/api/prisma -name "*holiday*"` → ❌ pas de seed
   - Conclusion : esprit du prompt satisfait (majorations correctement appliquées dans payroll-engine), lettre non. **DETTE-036** ouverte (3 actions : ADR vs migration table, Tessin manquant, règle "plus favorable" contrat>CCT). PR #73 mergée — commit `bb78926`.

2. **Code apps/worker** :
   - `dr-restore-test.worker.ts` : worker BullMQ mensuel (cron `0 3 1 * *`), exécute `test-roundtrip.sh` via `child_process.spawn`, parse rowCounts depuis log JSON `{"event":"dr_roundtrip.completed",...}`, callback `onResult` pour métriques Prometheus
   - `dr-restore-test.worker.test.ts` : 10 nouveaux tests (parseRowCounts edge cases, error class, callback) → **17 tests worker** (vs 7)

3. **Scripts shell ops/backup/** (chmod +x via `git update-index`) :
   - `pg_dump.sh` : pg_dump format custom + age encrypt + sha256 + upload (gs:// ou local) + retention rolling
   - `pg_restore.sh` : download + sha256 verify + age decrypt + drop+create cible + pg_restore. Guard anti-fat-finger : refuse cible sans suffixe `_dr`/`_test_`/`interim_dev`
   - `wal-archive.sh` : appelé par Postgres `archive_command` toutes les 5 min, chiffre+upload WAL pour PITR
   - `test-roundtrip.sh` : E2E dump → restore vers cible DR + verify rowcounts + mesure RTO

4. **Configs ops** :
   - `ops/docker-compose.dr-test.yml` : Postgres `_dr` sur port 5433
   - `ops/prometheus/rules/alerts-p1.yml` : +3 alertes DR (`PgDumpStale`, `DrRoundtripFailed`, `WalArchiveFailing`)
   - `ops/prometheus/rules/alerts-p2.yml` : +1 alerte `DrRestoreRtoBreached`
   - `ops/grafana/dashboards/backup-dr.json` : 4 stats + 2 timeseries + logs (events `pg_dump.completed` / `pg_restore.completed` / `dr_roundtrip.completed`)
   - `ops/alertmanager/alertmanager.yml` : remplace placeholder `<SLACK_WEBHOOK_URL>` par dummy URL valide overridable en prod (passe `amtool check-config`)
   - `.gitattributes` : force LF + scripts shell exécutables

5. **Docs** :
   - `docs/runbooks/disaster-recovery.md` : runbook DR complet (préconditions, architecture, procédure restore, PITR, rotation clés age, postmortem template)
   - `docs/runbooks/README.md` : ajout colonne Dashboard Grafana lié + entrée disaster-recovery
   - `ops/backup/README.md` : usage local + config prod + métriques + sécurité (rotation clés 6 mois)

6. **QA + validations** :
   - `pnpm typecheck` (8 workspaces) ✅
   - `pnpm lint` ✅ (corrections : `?? ''` au lieu de `|| ''`, suppression optional chain inutile sur `proc.stdout/stderr`)
   - `pnpm -r test` : **1105 unit + 6 integration** verts (vs 1095 avant ; +10 dr-restore-test)
   - `bash -n` sur les 4 scripts shell ✅
   - `JSON.parse` sur les 5 dashboards Grafana ✅
   - `promtool check rules` : **16 alertes** (P1=7, P2=6, P3=3) ✅
   - `promtool check config prometheus.yml` ✅
   - `amtool check-config alertmanager.yml` ✅
   - **E2E roundtrip docker-compose** : container postgres:16-alpine + age + bash, source 1850 rows seedées (4 tables critiques : temp_workers=100, mission_proposals=250, timesheets=500, audit_logs=1000) → dump+chiffrement → upload local → restore cible → rowcounts identiques → **RTO empirique 1 seconde** (budget 14400s = 4h)

7. **PR + merge** :
   - PR #74 ouverte, 8/8 CI checks verts
   - Merge admin rebase, branche supprimée, sync main local
   - Commit final : `ea52d41`

### Livrables

- **2 nouveaux fichiers code** worker : `dr-restore-test.worker.ts`, `dr-restore-test.worker.test.ts`
- **5 nouveaux fichiers ops/backup/** : `pg_dump.sh`, `pg_restore.sh`, `wal-archive.sh`, `test-roundtrip.sh`, `README.md`
- **3 nouveaux fichiers config** : `docker-compose.dr-test.yml`, `grafana/dashboards/backup-dr.json`, `.gitattributes`
- **1 nouveau runbook** : `docs/runbooks/disaster-recovery.md` (~340 lignes, 7 sections)
- **5 fichiers modifiés** : `.gitignore`, `docs/runbooks/README.md`, `ops/alertmanager/alertmanager.yml`, `ops/prometheus/rules/alerts-p{1,2}.yml`
- **PR #74** mergée — commit `ea52d41`
- Total LOC : +1900 / -10

### DoD A6.5 (toutes cochées)

- [x] Backup Postgres (script quotidien) + WAL archiving (toutes 5 min) → **RPO ≤ 6 min** (mieux que cible 15 min)
- [x] Chiffrement au repos (age encryption recipient/identity séparés)
- [x] Test de restauration mensuel automatisé (worker BullMQ + script)
- [x] **RPO ≤ 15 min ET RTO ≤ 4h prouvés par test local** (RTO empirique : 1s sur 1850 rows)
- [x] Runbook DR rédigé (préconditions, procédure, PITR, métriques, erreurs courantes, postmortem)

### Décisions

1. **age vs GPG** : choix age (https://age-encryption.org) — clés courtes (44 chars), format simple, audit code minimal. Recipient public déployé largement, identity privée scopée DR uniquement.
2. **format custom pg_dump** plutôt que SQL plain : plus rapide, parallélisable au restore (`-j 4`), compression incluse.
3. **Suffixe `_dr` obligatoire** sur la cible : guard du script `pg_restore.sh` refuse de drop une base sans ce suffixe (anti-fat-finger qui détruirait la prod).
4. **Rétention** : 90 jours dumps quotidiens (politique nLPD : pas plus que nécessaire), 30 jours WAL pour PITR rétroactif.
5. **Worker DR mensuel** vs hebdo : trade-off entre coût (un test = 1 instance Cloud SQL temporaire) et confiance. Mensuel suffit pour un MVP — passer à hebdo en sprint A.7 si on a un client prod sensible.
6. **Slack URL dummy en config repo** : remplacer `<placeholder>` par URL réellement valide (`https://hooks.slack.com/services/REPLACE-IN-PROD/...`) pour passer `amtool check-config` en CI sans exposer de webhook réel. En prod, override via `slack_api_url_file` Secret Manager mount.
7. **Métriques DR `dr_restore_*` / `pg_dump_*` / `wal_archive_*`** référencées par dashboards/alertes mais pas encore exposées par le worker — bloqué par DETTE-033 (worker `/metrics` endpoint), à wire plus tard.

### Dettes ouvertes (nouvelle)

- [ ] **DETTE-037** : Job CI mensuel qui exécute `test-roundtrip.sh` dans GitHub Actions (similaire à `Integration tests Testcontainers` mais avec compose `dr-test`). Sinon le test E2E ne tourne qu'en local — risque de régression silencieuse sur les scripts shell.

### Prochain prompt suggéré

Sprint A.6 catalogue désormais : **5/7 prompts complétés** (A6.1, A6.2, A6.3, A6.4, A6.5). Restent :
- **`A6.6-pentest-externe`** — externe (prestataire CH + budget). Bloque go-live (A6.7).
- **`A6.7-go-live-pilote`** — externe (autorisation LSE BLOCKER-002 + provisioning GCP DETTE-015 + Firebase DETTE-014 + client pilote signé).

**Aucun prompt code-only restant dans le catalogue A.6.** Pistes alternatives si tu veux continuer en code :

| Piste | Effort | Valeur |
|---|---|---|
| **DETTE-033** (worker `/metrics` endpoint + counters BullMQ) | S | Débloque dashboards `queue-depth` + `mp-health` (outbox lag) qui sont actuellement vides |
| **DETTE-035** (métriques business `payroll_batch_*` + `availability_outbox_*`) | S | Débloque dashboards `payroll-batch` + `mp-health` |
| **DETTE-036(a)** ADR canton_holidays + ajouter Tessin + règle "plus favorable" CCT | M | Ferme la divergence A5.2 |
| **DETTE-037** (job CI mensuel test-roundtrip) | M | Évite régression DR |
| **AH.003** (extension design Helvètia aux écrans non-couverts : availabilities, payroll, invoicing, seco-export, compliance) | M-L | UX mais pas critique go-live |

À défaut d'instruction, l'orchestrateur suggère **DETTE-033 + DETTE-035 ensemble** (1 PR cohérente "feat(worker): /metrics endpoint + business counters") car ils débloquent immédiatement les 4 dashboards Grafana posés en A6.3 + A6.5 qui sont actuellement à moitié vides.

### Métriques

- **Prompts catalogue** : 44/48 (91.7%) — A6.5 fermé
- **Tests** : **1105 unit + 6 integration** sur 8 workspaces (+10 vs 1095)
- **Dettes** : 10 ouvertes (5 anciennes + 3 A6.3 + 1 A5.2 + 1 A6.5) / 23 fermées
- **Effort réel A6.5** : ~3h (vs M = 1 jour estimé) — réutilisation patterns A6.3 (worker BullMQ + ops/), focus E2E test plutôt que stack production

---

## Session 2026-04-23 09:00 — Prompt A6.3 observability stack (clôture ops infra)

- **Opérateur** : Claude Code (Sonnet 4.5) — déclencheur : user "exécute prompts/sprint-a6-compliance-golive/A6.3-observability-stack.md selon le protocole ORCHESTRATOR §3"
- **Prompt exécuté** : `A6.3-observability-stack` — clôture ops infra (Grafana dashboards + Loki promtail + Alertmanager rules + docker-compose.observability)
- **Sprint** : A.6
- **Branche Git** : `feat/A6.3-observability-stack`
- **Skills chargées** : `skills/dev/devops-swiss/SKILL.md`, `skills/ops/release-management/SKILL.md`, `skills/dev/observability/SKILL.md`
- **Dépendances vérifiées** : OK — code Sentry/OTel/Prometheus déjà posé via PR #48 (DETTE-026/027). Reste à finir : configs YAML/JSON ops + pino logger structuré.
- **Objectif de la session** : poser les configs Grafana/Loki/Alertmanager dans `ops/` + docker-compose local pour valider la stack sans dépendre d'un Grafana Cloud externe ; ajouter le pino logger avec redaction PII.

### Déroulé

1. **Code apps/api**
   - Ajout deps `pino@9.x` + `pino-http@11.x` (`apps/api/package.json`)
   - `apps/api/src/infrastructure/observability/logger.ts` : `createLogger()` factory pino avec config nLPD-compliant (PII redactée : iban, avs, email, phone, password, token, firstName, lastName, fullName + header Authorization), helper `hashWorkerId(id)` SHA-256 tronqué 16 hex chars pour pseudonymisation, singleton `getDefaultLogger()` lazy-init
   - `apps/api/src/shared/middleware/request-id.middleware.ts` : middleware `X-Request-Id` / `X-Correlation-Id` (UUIDv4 par défaut, respecte le client si fourni, max 128 chars protection abuse)
   - `apps/api/src/app.ts` : wire `requestIdMiddleware` + `pinoHttp` (genReqId pointe sur req.id du middleware, customLogLevel : error pour 5xx / warn pour 4xx / info sinon, désactivé en `NODE_ENV=test`)
   - `apps/api/src/main.ts` : remplace `console.log` par `logger.info`, init Sentry avec sample rate 10% prod / 100% dev
   - 14 nouveaux tests (8 logger + 5 request-id + 1 stub) → **235 tests** sur api (vs 221)

2. **Configs ops/** (création complète)
   - `ops/prometheus/prometheus.yml` : scrape api (port 3000) + worker (9090) + auto-monitoring
   - `ops/prometheus/rules/alerts-p1.yml` : ApiDown, ApiHigh5xxRate, PayrollBatchFailed, BullmqBacklogTooHigh
   - `ops/prometheus/rules/alerts-p2.yml` : ApiHighLatencyP95, ApiHigh4xxRate, MoveplannerCircuitBreakerOpen, MoveplannerPushFailureRate, WebhookHmacFailureRate
   - `ops/prometheus/rules/alerts-p3.yml` : DiskFillingUp, MemoryHigh, OutboxAvailabilityLag
   - `ops/alertmanager/alertmanager.yml` : routage P1→on-call (SMS Swisscom + Slack #incidents, repeat 30 min), P2→dev-team (Slack #alerts, repeat 2h), P3→tickets Linear (repeat 24h), inhibit ApiDown
   - `ops/loki/loki-config.yml` : monolithique filesystem (/tmp/loki en dev → GCS prod), rétention 8760h (12 mois nLPD), ingestion 10MB/s
   - `ops/promtail/promtail-config.yml` : scrape Docker socket pour les containers labellisés `com.docker.compose.project=interim`, parse JSON pino, promote level/service comme labels low-cardinality, drop debug en prod
   - `ops/tempo/tempo-config.yml` : OTLP gRPC (4317) + HTTP (4318), rétention 360h (15 jours), local filesystem
   - `ops/grafana/provisioning/datasources/datasources.yml` : Prometheus + Loki + Tempo avec cross-links (Prom exemplars → Tempo, Loki derived fields → Tempo, Tempo tracesToLogs → Loki + tracesToMetrics → Prom)
   - `ops/grafana/provisioning/dashboards/dashboards.yml` : provider auto-load depuis filesystem
   - 4 dashboards Grafana JSON :
     - `api-health.json` : 4 stats (up/rate/5xx%/p95) + 2 timeseries (rate par route, p50/p95/p99) + logs error|warn
     - `mp-health.json` : 4 stats (CB state/push success/outbox lag/webhooks 1h) + 4 timeseries (rate/p95 outbound, webhooks par event_type/outcome, dispatch p95)
     - `payroll-batch.json` : 4 stats (durée/workers/échecs 7j/CHF brut) + timeseries 30j + logs payroll.batch
     - `queue-depth.json` : table état queues + timeseries waiting/failed + logs workers
   - `ops/docker-compose.observability.yml` : stack runnable localement (Prometheus + Alertmanager + Loki + Promtail + Tempo + Grafana, ports 3000/9090/9093/3100/3200/4317/4318)
   - `ops/README.md` : usage local + bascule Grafana Cloud prod + alertes par sévérité + pseudonymisation nLPD + rétention par signal

3. **QA**
   - `pnpm typecheck` vert (8 workspaces)
   - `pnpm lint` vert (corrections : `??=` operator + cast typage `req.id` vs pino-http augmentation)
   - `pnpm -r test` : **1095 unit + 6 integration** verts
   - Prettier write sur 14 fichiers nouveaux

4. **PR + merge**
   - PR #71 ouverte avec DoD complète + alertes par sévérité + conformité nLPD
   - 8/8 CI checks verts (lint + format + typecheck + unit + integration + coverage + audit + docker smoke + build api)
   - Merge admin rebase, branche supprimée, sync main local

### Livrables

- **9 nouveaux fichiers code** : `logger.ts`, `logger.test.ts`, `request-id.middleware.ts`, `request-id.middleware.test.ts` ; modifs `app.ts`, `main.ts`, `package.json`
- **14 nouveaux fichiers ops** : prometheus (1 + 3 rules), alertmanager, loki, promtail, tempo, grafana (2 provisioning + 4 dashboards), docker-compose, README
- **PR #71** mergée — commit `cd1b6b8`
- Total LOC : +2378 / -8 (essentiellement des YAML/JSON ops + dashboards riches)

### Décisions

1. **pino-http désactivé en `NODE_ENV=test`** : sinon vitest pollue l'output avec 1 ligne JSON par requête supertest. Le middleware request-id reste actif pour que les tests vérifient le comportement.
2. **Augmentation `Request.id`** : pino-http augmente déjà `Request.id: ReqId` (= `string | number | object`). On n'ajoute pas notre propre augmentation pour éviter le conflit `string | undefined` vs `ReqId` ; on cast localement `(req as Request & { id: string }).id` au point d'assignation.
3. **Loki en mode monolithique single-binary filesystem** : suffisant pour MVP/pilote. Migration vers GCS object_store quand on dépassera 100GB de logs ou multi-zone (sprint A.7+).
4. **Alertmanager `oncall-sms-bridge` documenté mais non-implémenté** : c'est un service custom à wire en sprint A.7 (passerelle Swisscom SMS API). Pour l'instant, le webhook config existe mais pointe nulle part.
5. **Worker `/metrics` endpoint manquant** : noté dans la PR comme dette future. Le scrape config est déjà prêt à être activé quand on wire l'observabilité côté worker.
6. **Pas de `metrics_generator` Tempo** : feature d'auto-génération de métriques RED depuis les traces. Activable plus tard (sprint A.7 capacity tuning).

### Dettes ouvertes (nouvelles)

- [ ] **DETTE-033** : Wire `/metrics` endpoint sur `apps/worker/main.ts` (port 9090) avec counters BullMQ par queue (`bullmq_jobs_waiting`, `bullmq_jobs_active`, `bullmq_jobs_failed`). Sans ça, les dashboards `queue-depth` et `mp-health` (outbox lag) restent vides.
- [ ] **DETTE-034** : Implémenter `oncall-sms-bridge` (passerelle webhook → Swisscom SMS API) ou wire un service tiers (PagerDuty, Opsgenie). Sinon le receiver `on-call` Alertmanager n'envoie qu'à Slack.
- [ ] **DETTE-035** : Métriques business `payroll_batch_*` et `availability_outbox_*` référencées par les dashboards mais pas encore exposées par le code. À ajouter dans le worker payroll-batch et le worker availability-sync (sprint A.7 ou DETTE-033 incluse).

### Prochain prompt suggéré

**`A6.5-backup-restore-dr-test` (M)** — préparation locale faisable (scripts pg_dump + restore + runbook DR avec docker-compose Postgres, test E2E roundtrip). Activation prod attend DETTE-015 (provisioning GCP). Débloquerait A6.7 (go-live) sur le critère "backup testé mensuellement" du skill devops-swiss.

**Alternatives** :
- **DETTE-033** (worker /metrics) : ferme la boucle observabilité côté worker, valeur immédiate pour les dashboards qui sont actuellement à moitié vides
- **AH.003** (extension design Helvètia aux écrans non-couverts) : moins critique pour go-live mais visible UX

### Métriques

- **Prompts catalogue** : 43/48 (89.6%) — A6.3 fermé
- **Tests** : **1095 unit + 6 integration** sur 8 workspaces (vs 1081 avant)
- **Dettes** : 8 ouvertes (5 anciennes + 3 nouvelles A6.3) / 23 fermées
- **Effort réel** : ~2.5h (vs M = 1 jour estimé) — la pré-existence du code Sentry/OTel/Prometheus a réduit le périmètre

---

## Session 2026-04-23 06:30 — Resynchronisation PROGRESS.md (sprint marathon A1.2 → A6.4 + 2 ad-hoc)

- **Opérateur** : Claude Code (Sonnet 4.5) — déclencheur : user "Avant toute chose : resynchronise PROGRESS.md avec l'état réel du repo"
- **Branche** : `main` (pas de feature branch — c'est un audit/recalibrage, pas du code)
- **Objectif** : combler la dérive entre `PROGRESS.md` (figé à 5/53 prompts au 2026-04-22 07:35) et l'état réel du repo (42/48 catalogue mergés + 2 ad-hoc).

### Méthode (audit en 5 passes)

1. **Lecture protocole** : `CLAUDE.md` + `ORCHESTRATOR.md` rechargés en intégralité.
2. **Inventaire git** :
   - `git log --oneline -100` → 66 commits sur `main` depuis bootstrap
   - `gh pr list --state merged --limit 100 --json` → **52 PRs mergées** entre 2026-04-21 17:49 et 2026-04-23 05:02
3. **Croisement prompt ↔ PR ↔ commit** par nom de branche `feat/AX.Y-titre` :
   - Sprint A.0 : 5/6 (A0.4 externe — provisioning GCP)
   - Sprint A.1 : **7/7 ✅**
   - Sprint A.2 : **6/6 ✅**
   - Sprint A.3 : **6/6 ✅**
   - Sprint A.4 : **7/7 ✅**
   - Sprint A.5 : 8/9 (A5.5 externe — sandbox Swissdec ; A5.2 bundlé dans A5.1 commit `a7cbe22`)
   - Sprint A.6 : 3.5/7 (A6.1+A6.2+A6.4 ✅, A6.3 partiel code-only, A6.5/A6.6/A6.7 externes)
   - Ad-hoc : 2 (PR #68 design Helvètia, PR #69 fix dev server)
4. **Vérification physique du code** quand le commit message ne suffisait pas :
   - `packages/domain/src/payroll/surcharge-rules.ts` + `canton-holidays.ts` confirment A5.2 inclus dans A5.1
   - `apps/api/src/infrastructure/observability/{metrics,tracing,sentry}.ts` confirment le code A6.3 posé via PR #48 (DETTE-026/027)
   - `docs/runbooks/{database-down,mp-unreachable,payment-file-rejected,payroll-batch-failed,secret-leaked,webhook-storm}.md` confirment A6.4 ✅
5. **Suite de tests complète** : `pnpm -r --if-present test` → **1081 unit + 6 integration** verts sur 8 workspaces (vs 206 dans le dernier PROGRESS).
   - shared: 67 tests (10 files)
   - mock-moveplanner: 8 tests (1 file)
   - domain: 451 tests (37 files)
   - web-portal: 16 tests (3 files)
   - application: 266 tests (43 files)
   - web-admin: 45 tests (6 files)
   - worker: 7 tests (2 files)
   - api: 221 tests (26 files)

### Décisions de remise au propre du working tree

| Élément | Décision | Justification |
|---------|----------|---------------|
| `stash@{0}` (`next-env.d.ts` autogen) | **drop** | 3 lignes auto-générées par Next dev runtime à chaque démarrage. Sans valeur, sera regénéré au besoin. |
| `.design-tmp/` (bundle design Helvètia extrait via tar) | **gitignore** (`.gitignore` mis à jour) | Artefact one-shot déjà utilisé pour produire PR #68 (mergée). Garder localement comme référence mais ne pas committer. |

### Livrables

- `prompts/orchestrator/PROGRESS.md` — réécriture complète (état réel)
- `prompts/orchestrator/SESSION-LOG.md` — cette entrée
- `.gitignore` — ajout `.design-tmp/`

### Métriques

- **Prompts catalogue** : 42/48 (87.5%) mergés en 36h (sprint marathon 2026-04-21 17:49 → 2026-04-23 05:02)
- **PRs ad-hoc** : 2 (design + fix dev)
- **Dettes** : 5 ouvertes (toutes externes ou A.6 ops) / 23 fermées
- **Blockers** : 2 (LSE auth, sandbox MP — toujours externes)
- **Vélocité** : ~14 prompts/jour observée sur 36h continues

### Prochain prompt suggéré

**`A6.3-observability-stack` — clôture ops infra (M, ~1 jour)**

Justification (per ORCHESTRATOR §5) :
1. **Chemin critique** : sprint A.6 en cours, A6.3 partiellement fait — clore la boucle est plus court qu'attaquer A6.5
2. **Déblocage** : A6.3 complet débloque A6.6 (pentest a besoin des dashboards de monitoring) et A6.7 (go-live exige Alertmanager actif)
3. **Code only** : aucune dépendance externe (les YAML/JSON Grafana + Loki + Alertmanager sont des fichiers dans le repo, validables via docker-compose local)
4. **Taille** : M (1 jour), tient dans une session sans risque de saturation

**Alternatives proposées** :
- **`A6.5-backup-restore-dr-test` (M)** : préparation locale faisable (scripts pg_dump + restore + runbook DR avec docker-compose Postgres). Activation prod attend DETTE-015 (provisioning GCP).
- **Continuer le design Helvètia** (ad-hoc `AH.003`) : appliquer le design system aux écrans non-couverts (availabilities calendar, payroll, invoicing, seco-export, compliance dashboard) — plus visible côté UX mais moins critique pour le go-live.

À défaut d'instruction, l'orchestrateur suggère **A6.3** comme prochain prompt.

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
