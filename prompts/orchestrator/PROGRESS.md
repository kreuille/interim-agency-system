# PROGRESS.md — État d'avancement du projet

> **Dernière mise à jour** : 2026-04-21 22:45 — DETTE-010/017/018/019 fermées. 140 tests verts, coverage enforcement CI actif.
> **Source de vérité** pour l'orchestrateur. **Ne jamais** le mettre à jour à la main sans avoir suivi le protocole `ORCHESTRATOR.md`.

---

## 0. Instantané

- **Sprint courant** : A.1 (1/7 prompts complétés)
- **Phase** : première entité métier complète, architecture hexagonale validée de bout en bout
- **Prochain prompt** : `A1.2-worker-documents-upload`
- **Prompts complétés** : 5 / 53
- **Prompts détaillés prêts à exécuter** : 48 sprint + 5 OPS = **53/53** 🎉
- **Blockers ouverts** : 2 (BLOCKER-001 sandbox MP, BLOCKER-002 autorisation LSE — externes, non-dev)
- **Dette technique** : 11 ouvertes / 8 fermées (DETTE-010/017/018/019/020/021/022/023)
- **Vélocité observée** : — (premier prompt tout juste fini)
- **Skills disponibles** : 32 (voir `skills/README.md`)
- **Documents de référence** : 10 (brief, spec, plan, archi, risques, rôles, registre nLPD, pr-template, ADR-0001, skills README)

---

## 1. Prompts par statut

### ✅ Completed

| Prompt | Sprint | Complété le | Branche / PR | Commit | Notes |
|--------|--------|-------------|--------------|--------|-------|
| `A0.1-init-monorepo` | A.0 | 2026-04-21 | [PR #1](https://github.com/kreuille/interim-agency-system/pull/1) ✅ merged | `0b9cd1e` | Monorepo pnpm + 4 packages + 4 apps + 15 tests verts |
| `A0.2-docker-compose-local` | A.0 | 2026-04-21 | [PR #2](https://github.com/kreuille/interim-agency-system/pull/2) ✅ merged | `3c36bd5` | docker-compose + Makefile + mock MP + smoke test ; stack up en 13 s |
| `A0.3-ci-github-actions` | A.0 | 2026-04-21 | [PR #3](https://github.com/kreuille/interim-agency-system/pull/3) ✅ merged | `7e335e3` | 3 workflows (ci, trivy, release) + dependabot + CODEOWNERS + PR template ; CI verte sur PR #3 elle-même |
| `A0.5-prisma-schema-v0` | A.0 | 2026-04-21 | [PR #17](https://github.com/kreuille/interim-agency-system/pull/17) ✅ merged | `7c0ac23` | 18 modèles + 13 enums + migration initiale appliquée + seed idempotent + tenant middleware testé |
| `A1.1-worker-entity-crud` | A.1 | 2026-04-21 | `feat/A1.1-worker-entity-crud` | (à pousser) | VOs (Avs/Iban/Canton/Name/Email/Phone) + entité TempWorker + 5 use cases + Prisma repo + REST + OpenAPI + audit log ; 101 tests verts |

### 🟡 In progress

*(aucun)*

### ⏸ In progress — paused (contexte saturé)

*(aucun)*

### 🔵 Pending (ordre de priorité)

| Ordre | Prompt | Sprint | Effort | BlockedBy | Notes |
|-------|--------|--------|--------|-----------|-------|
| 1 | `A1.2-worker-documents-upload` | A.1 | L | A1.1 ✅ | **Prêt à lancer** — wire storage CMEK attend DETTE-015 |
| 2 | `A0.4-hosting-ch-provisioning` | A.0 | L | DETTE-015 | Action humaine fondateur (provisioning GCP selon ADR-0002) |
| 3 | `A0.6-auth-firebase-setup` (côté tenant) | A.0 | S | DETTE-014 | Action humaine fondateur (création projets Firebase selon `docs/firebase-setup.md`) |
| 8 | `A1.2-worker-documents-upload` | A.1 | L | A1.1 | Chiffrement CMEK |
| 9 | `A1.3-document-expiry-alerts` | A.1 | M | A1.2 | |
| 10 | `A1.4-client-entity-crud` | A.1 | M | A0.5 | |
| 11 | `A1.5-client-contract-rate-card` | A.1 | M | A1.4 | Taux CCT obligatoires |
| 12 | `A1.6-audit-log-infra` | A.1 | M | A0.5 | |
| 13 | `A1.7-admin-ui-core` | A.1 | L | A1.1,A1.4 | Next.js app-router |
| 14 | `A2.1-availability-entity` | A.2 | M | A1.1 | |
| 15 | `A2.2-availability-ui-calendar` | A.2 | L | A2.1,A1.7 | |
| 16 | `A2.3-availability-self-portal` | A.2 | L | A2.1 | PWA mobile intérimaire |
| 17 | `A2.4-moveplanner-api-client` | A.2 | L | A0.6 | mTLS + API key rotation |
| 18 | `A2.5-availability-push-queue` | A.2 | M | A2.1,A2.4 | BullMQ + idempotency |
| 19 | `A2.6-circuit-breaker-alerting` | A.2 | S | A2.4 | Opossum + Sentry |
| 20 | `A3.1-webhook-endpoint-hmac` | A.3 | M | A0.6 | Vérif signature + tolérance horloge |
| 21 | `A3.2-inbound-webhook-persistence` | A.3 | M | A3.1 | Idempotency par Event-Id |
| 22 | `A3.3-mission-proposal-entity` | A.3 | M | A1.1 | |
| 23 | `A3.4-proposal-routing-modes` | A.3 | L | A3.3 | Pass-through vs contrôle |
| 24 | `A3.5-sms-swisscom-adapter` | A.3 | M | — | Parallèle A3.1 |
| 25 | `A3.6-proposal-dashboard-ui` | A.3 | L | A3.3,A1.7 | |
| 26 | `A4.1-mission-contract-entity` | A.4 | M | A3.3 | |
| 27 | `A4.2-contract-pdf-generator` | A.4 | L | A4.1 | Templates par branche CCT |
| 28 | `A4.3-signature-zertes-integration` | A.4 | L | A4.2 | Swisscom Trust Signing |
| 29 | `A4.4-ged-archival-10-years` | A.4 | M | A4.3 | |
| 30 | `A4.5-timesheet-inbound` | A.4 | M | A3.2 | Webhook `timesheet.ready_for_signature` |
| 31 | `A4.6-timesheet-review-ui` | A.4 | L | A4.5 | |
| 32 | `A4.7-timesheet-sign-dispute-api` | A.4 | M | A4.5,A2.4 | |
| 33 | `A5.1-payroll-engine-cct` | A.5 | XL | A4.7 | Cœur légal, tests massifs |
| 34 | `A5.2-payroll-majorations` | A.5 | M | A5.1 | Nuit/dim/supp |
| 35 | `A5.3-payroll-retenues-sociales` | A.5 | L | A5.1 | AVS/AC/LAA/LPP/IS |
| 36 | `A5.4-payslip-pdf-standard-ch` | A.5 | M | A5.1 | |
| 37 | `A5.5-elm-swissdec-adapter` | A.5 | L | A5.3 | |
| 38 | `A5.6-iso20022-pain001-export` | A.5 | M | A5.3 | PostFinance/UBS |
| 39 | `A5.7-invoice-qrbill-generator` | A.5 | L | A4.7 | Swiss Payment Standards |
| 40 | `A5.8-invoice-relances-pipeline` | A.5 | M | A5.7 | |
| 41 | `A5.9-accounting-export-bexio-abacus` | A.5 | L | A5.7 | |
| 42 | `A6.1-compliance-dashboard` | A.6 | M | A5.* | |
| 43 | `A6.2-seco-export-one-click` | A.6 | M | A6.1 | |
| 44 | `A6.3-observability-stack` | A.6 | L | — | Parallèle |
| 45 | `A6.4-runbooks-incidents` | A.6 | M | A6.3 | |
| 46 | `A6.5-backup-restore-dr-test` | A.6 | M | A0.4 | |
| 47 | `A6.6-pentest-externe` | A.6 | L | A6.*  | Prestataire CH |
| 48 | `A6.7-go-live-pilote` | A.6 | M | all A.* | Jour J |

### 🚫 Abandonned / Superseded

*(aucun)*

---

## 2. Sprints — vue synthétique

| Sprint | Début planifié | Fin planifiée | Prompts totaux | Complétés | Statut |
|--------|----------------|---------------|----------------|-----------|--------|
| A.0 | S1 | S1 | 6 | 4 | 🟡 En pause (A0.4 + A0.6 bloqués externe) |
| A.1 | S2 | S3 | 7 | 0 | 🔵 |
| A.2 | S4 | S5 | 6 | 0 | 🔵 |
| A.3 | S6 | S7 | 6 | 0 | 🔵 |
| A.4 | S8 | S9 | 7 | 0 | 🔵 |
| A.5 | S10 | S12 | 9 | 0 | 🔵 |
| A.6 | S13 | S14 | 7 | 0 | 🔵 |

---

## 3. Décisions techniques figées

Décisions prises et non renégociables sans ADR. Mettre à jour au fil de l'eau.

| Date | Décision | ADR | Prise par |
|------|----------|-----|-----------|
| 2026-04-21 | Stack Node.js 20 + TS strict + PostgreSQL 16 + Next.js 14 | `docs/adr/0001-stack-choice.md` | Brief |
| 2026-04-21 | Hébergement Suisse obligatoire (Infomaniak ou Exoscale) | ADR-0002 (à créer A0.4) | Brief |
| 2026-04-21 | Architecture hexagonale | `CLAUDE.md §2.2` | Lead tech |
| 2026-04-21 | Montants en Rappen (bigint), `Currency = 'CHF' \| 'EUR'` | `CLAUDE.md §3.1` + Money.ts | Brief + spec MP |
| 2026-04-21 | Orchestrateur de prompts Markdown (ce document) | ADR-0003 (à créer) | PO + fondateur |
| 2026-04-21 | Packages exportent `.ts` direct (pas de compile intermédiaire) | A0.1 SESSION-LOG | A0.1 |
| 2026-04-21 | Pas de `composite: true` ni project refs à ce stade | A0.1 SESSION-LOG | A0.1 |
| 2026-04-21 | `docs/`, `prompts/`, `skills/`, CLAUDE.md, README.md exclus de Prettier | `.prettierignore` | A0.1 |
| 2026-04-21 | Augmentation Express via `namespace Express` globale pour `req.user` | `tenant.middleware.ts` | A0.5 |
| 2026-04-21 | `pnpm.onlyBuiltDependencies` : esbuild, @prisma/client, @prisma/engines, prisma | `package.json` | A0.5 |
| 2026-04-21 | 18 modèles Prisma + 13 enums, FK `onDelete: Restrict` pour données légales | `apps/api/prisma/schema.prisma` | A0.5 |
| 2026-04-21 | Hébergement GCP `europe-west6` (Zurich) — Cloud Run + Cloud SQL + CMEK | `docs/adr/0002-hosting-choice.md` | Fondateur |
| 2026-04-21 | Auth Firebase Identity Platform multi-tenancy native | `docs/adr/0003-auth-choice.md` | Fondateur |
| 2026-04-21 | RBAC 7 rôles × 12 actions typés ; MFA obligatoire pour `agency_admin` + `payroll_officer` | `packages/domain/src/auth/role.ts` | A0.6 |
| 2026-04-21 | Repo **public** — GitHub Rulesets `main-protection` + secret scanning + Dependabot alerts activés | ruleset id 15364662 | Fondateur |
| 2026-04-21 | Idempotency-Key inbound : UUID v4 + cache DB 24h, hash `sha256(method\|path\|body)` | `idempotency.middleware.ts` | DETTE-017 |
| 2026-04-21 | Tenant-guard Prisma : defense-in-depth contre fuites cross-tenant via `$extends` | `tenant-guard.ts` | DETTE-019 |
| 2026-04-21 | Coverage enforcement CI : seuils par workspace (domain 85%, shared 80%, app/api 70-80%) | `**/vitest.config.ts` + `.github/workflows/ci.yml` | DETTE-018 |

---

## 4. Blockers ouverts

### 🔴 BLOCKER-001 — Accès sandbox MovePlanner

- **Ouvert le** : 2026-04-21
- **Bloque** : A.2 dans sa globalité (push API)
- **Action** : envoyer demande officielle à l'équipe MovePlanner avec certificat mTLS de test, endpoint webhook temporaire tunneling (ngrok / loophole)
- **Responsable** : PO / fondateur
- **ETA** : S1
- **Mitigation** : mock server OpenAPI local (`apps/mock-moveplanner`) si délai > 10 j

### ✅ BLOCKER-003 — Hosting **résolu côté décision** (GCP europe-west6)

- **Ouvert le** : 2026-04-21 — **Clos le** : 2026-04-21 (décision)
- **Décision** : GCP `europe-west6` (Zurich). Voir `docs/adr/0002-hosting-choice.md`.
- **Reste** : DETTE-015 — provisioning effectif (Cloud SQL + Memorystore + Cloud Storage + Secret Manager + OIDC WIF + DPA Google Cloud Switzerland GmbH). Action humaine, pas de blocker dev.

### ✅ BLOCKER-004 — Auth **résolu côté décision + code** (Firebase Identity Platform)

- **Ouvert le** : 2026-04-21 — **Clos le** : 2026-04-21
- **Décision** : Firebase Identity Platform, multi-tenancy native, un `tenantId` = une agence. Voir `docs/adr/0003-auth-choice.md`.
- **Code posé** : RBAC typé (`@interim/domain/auth/role`), `TokenVerifier` abstrait + implémentation Firebase, `authMiddleware` avec gates email_verified + mfa_required, 13 tests verts.
- **Reste** : DETTE-014 — créer les projets Firebase `interim-agency-system` + `-staging`, activer les providers, poser le service account JSON. Suivre `docs/firebase-setup.md`. Action humaine fondateur.

### 🔴 BLOCKER-002 — Autorisation cantonale LSE

- **Ouvert le** : 2026-04-21
- **Bloque** : go-live pilote (A.6.7). **Ne bloque pas** le dev du MVP mais bloque l'exploitation commerciale.
- **Action** : dépôt du dossier au SCTP/OCE du canton, fournir organigramme, caution bancaire (variable selon canton)
- **Responsable** : fondateur + juriste
- **ETA** : 4 à 12 semaines selon canton (GE/VD généralement 2-3 mois)
- **Mitigation** : démarrer le pilote sous autorisation d'un partenaire déjà autorisé (portage) si pas reçu à temps

---

## 5. Dettes techniques qualifiées (TODO trackés)

| ID | Ouverte le | Prompt déclencheur | Description | Priorité | ETA |
|----|-----------|-------------------|-------------|----------|-----|
| DETTE-001 | 2026-04-21 | A0.1 | Réintroduire `composite: true` + project refs quand un vrai cas de build compilé apparaît (prod Docker image api) | M | A0.3 |
| ~~DETTE-002~~ | ~~2026-04-21~~ | ~~A0.1~~ | ~~Créer repo GitHub, pousser la branche et ouvrir la PR~~ — **fermée 2026-04-21, repo `kreuille/interim-agency-system` créé, PR #1 ouverte** | ~~H~~ | ✅ |
| DETTE-003 | 2026-04-21 | A0.1 | Décider si on approuve les scripts postinstall esbuild via `pnpm approve-builds` dans CI | L | A0.3 |
| DETTE-004 | 2026-04-21 | A0.1 | Renforcer le hook pré-commit avec `typecheck` incremental une fois composite en place | L | A0.3 |
| DETTE-005 | 2026-04-21 | A0.2 | Ajouter container `api` dans docker-compose pour tester pipeline complet webhook mock → api | M | A0.3 |
| DETTE-006 | 2026-04-21 | A0.2 | Compléter les endpoints du mock MovePlanner (couverture totale de docs/02) | L | A3 / A4 |
| ~~DETTE-007~~ | 2026-04-21 | A0.3 | ~~Appliquer branch protection sur `main` via `gh api`~~ — **requalifiée DETTE-013** : feature payante sur repo privé | ~~H~~ | voir DETTE-013 |
| DETTE-008 | 2026-04-21 | A0.3 | Durcir `pnpm audit` en bloquant (retirer `\|\| true`) une fois Dependabot a nettoyé le backlog | L | A6.6 |
| DETTE-009 | 2026-04-21 | A0.3 | Ajouter un job CI `build-api` quand l'app API aura un Dockerfile | M | A0.5 |
| ~~DETTE-010~~ | 2026-04-21 | A0.5 | ~~Wrapper Prisma middleware qui injecte `where: { agencyId }`~~ — **fermée 2026-04-21** : remplacée par tenant-guard defense-in-depth (DETTE-019). L'injection automatique s'est avérée risquée (bypass involontaire) ; la garde de vérification est plus sûre | ~~H~~ | ✅ |
| DETTE-011 | 2026-04-21 | A0.5 | Tests d'intégration Prisma via Testcontainers Postgres pour isolation tenant réelle | H | avant A1.1 |
| DETTE-012 | 2026-04-21 | A0.5 | Container `api` dans docker-compose pour tests E2E webhook → api → db | M | A3 |
| ~~DETTE-013~~ | 2026-04-21 | déblocage | ~~Branch protection/Rulesets GitHub~~ — **fermée 2026-04-21** : repo passé public, ruleset `main-protection` créé (id 15364662), secret scanning + push protection + Dependabot alerts activés | ~~H~~ | ✅ |
| DETTE-014 | 2026-04-21 | déblocage | Créer projets Firebase `interim-agency-system` + `-staging` selon `docs/firebase-setup.md` | H | S1 |
| DETTE-015 | 2026-04-21 | déblocage | Provisionner GCP `europe-west6` (Cloud SQL, Memorystore, Cloud Storage, Secret Manager, OIDC WIF) selon ADR-0002 | H | S2 |
| DETTE-016 | 2026-04-21 | déblocage | Cloud Function `onCreate` qui pose les custom claims `agencyId` + `role` à l'inscription | M | A1.7 |
| ~~DETTE-017~~ | 2026-04-21 | A1.1 | ~~`Idempotency-Key` cache inbound pour POST/PUT workers~~ — **fermée 2026-04-21** : middleware + Prisma store + 7 tests + wired dans `/api/v1` | ~~M~~ | ✅ |
| ~~DETTE-018~~ | 2026-04-21 | A1.1 | ~~Coverage CI enforcement~~ — **fermée 2026-04-21** : `@vitest/coverage-v8` + seuils par workspace + job CI `test-coverage` avec upload artifact HTML | ~~M~~ | ✅ |
| ~~DETTE-019~~ | 2026-04-21 | A1.1 | ~~Prisma middleware tenant-injection~~ — **fermée 2026-04-21** : `installTenantGuard` via `$extends` + `assertTenantConsistent` fonction pure + 7 tests. Complète ~~DETTE-010~~ également | ~~H~~ | ✅ |

---

## 6. Métriques de pilotage

| Métrique | Valeur | Cible | Tendance |
|----------|--------|-------|----------|
| Prompts completed / semaine | — | 4–6 | — |
| Couverture tests globale | — | ≥ 70% | — |
| Couverture domain | — | ≥ 85% | — |
| Blockers conformité ouverts | 1 (LSE) | 0 avant go-live | — |
| Dettes techniques qualifiées | 0 | < 10 | — |
| PR avec revue humaine | — | 100% | — |
| Incidents staging / sem | — | < 2 | — |

---

## 7. Contacts et rôles clés (à compléter)

| Rôle | Nom | Responsabilité | Contact |
|------|-----|---------------|---------|
| Fondateur / PO | *à compléter* | Validation métier, priorités | *@* |
| Lead tech / CTO | *à compléter* | Revue archi, arbitrages techniques | *@* |
| Dev full-stack 1 | *à compléter* | Backend + intégration MP | *@* |
| Dev full-stack 2 | *à compléter* | Front-office + portail PWA | *@* |
| Juriste / DPO | *à compléter* | LSE, CCT, nLPD | *@* |
| Référent MovePlanner | *à compléter* | Accès sandbox, questions API | *@* |

---

## 8. Historique des revues d'orchestration (weekly)

*(à compléter chaque vendredi via OPS.weekly-review.md)*

| Semaine | Prompts completed | Vélocité | Blockers ajoutés/clos | Notes |
|---------|-------------------|----------|----------------------|-------|

---

**Fin de PROGRESS.md — instantané initial du 2026-04-21**
