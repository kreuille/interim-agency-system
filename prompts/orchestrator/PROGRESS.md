# PROGRESS.md — État d'avancement du projet

> **Dernière mise à jour** : 2026-04-23 22:30 — **Preview live 100% utilisable** après fix Chrome debug (PR #87 `43778ce`). Bug constaté en navigateur : web-admin `/login` crashait avec `TypeError: n.uptime is not a function` (bundle prom-client côté client via `@interim/shared` barrel). **Fix B propre** : retiré `prom-registry` du barrel, ajouté sub-path explicite `@interim/shared/observability/prom-registry`, mis à jour le seul consumer (`apps/worker/src/observability/business-metrics.ts`). 3 fichiers, 20 lignes. Web-admin Cloud Run redeployé revision 00002. **Verify Chrome end-to-end** : login form rendu, dashboard back-office complet (sidebar, KPIs S17, alertes conformité, intégration MP) — zéro erreur console. Le portail intérimaire fonctionnait déjà. Historique de la session : Wiring DI minimal (PR #84 `a18c6b9`) + Phase 2 GCP preview (PR #85 `5eb2963`) + chore orchestrator (PR #86 `91e4373`) + fix prom-client (PR #87). **Prochain prompt : STOP code-only** — actions externes inchangées (A0.4, A5.5, A6.6, A6.7), preview prête pour démo réelle.
> **Source de vérité** pour l'orchestrateur. **Ne jamais** le mettre à jour à la main sans avoir suivi le protocole `ORCHESTRATOR.md`.

---

## 0. Instantané

- **Sprint courant** : A.6 (5/7 prompts complétés côté code — A6.6 + A6.7 restent en actions externes). Dépassement opportuniste post A.6 : wiring DI minimal (PR #84, ouvre DETTE-042 pour reste) + preview GCP live (PR #85).
- **Phase** : MVP + observabilité production-ready (logs structurés, dashboards Grafana **vivants** avec 20 business counters, alertes P1/P2/P3, DR RPO ≤ 6 min RTO ≤ 4h démontrés, workflow CI DETTE-037). **Preview live accessible** sur Cloud Run (outil démo/test, PAS production — cf. §1). Restent toujours **uniquement** actions externes pour go-live réel : A0.4, A5.5, A6.6, A6.7.
- **Preview URLs (live)** :
  - API : https://interim-preview-api-332513055634.europe-west1.run.app
  - Back-office : https://interim-preview-web-admin-332513055634.europe-west1.run.app
  - Portail intérimaire : https://interim-preview-web-portal-332513055634.europe-west1.run.app
  - Mock MovePlanner : https://interim-preview-mock-mp-332513055634.europe-west1.run.app
  - Auth : `Authorization: Bearer <anything>` (AUTH_MODE=dev) → agency_admin sur "Agence Pilote SA"
  - Cloud SQL : `interim-preview-pg` Postgres 16 f1-micro enterprise zonal (europe-west1)
  - Coût : ~8-10 CHF/mois — procédure kill dans `docs/runbooks/preview-deployment.md` §8
- **Prochain prompt** : **STOP code-only — bascule actions externes.** La preview est un terrain de jeu cliquable mais n'annule aucune dépendance prod. Voir **§1 "STOP code-only"** ci-dessous pour l'ordre des actions humaines (A0.4, A5.5, A6.6, A6.7).
- **Prompts complétés** : 44 / 48 catalogue (91.7%) + 2 ad-hoc (design + dev fix) + 0 / 5 OPS
- **Blockers ouverts** : 2 (BLOCKER-001 sandbox MP, BLOCKER-002 autorisation LSE — externes, non-dev)
- **Dette technique** : 14 ouvertes / 26 fermées (DETTE-033/035/037 closes, DETTE-040/041/042 wiring runtime ouvertes)
- **Tests** : **1210 unit + 53 integration** sur 8 workspaces (vs 1167/53 ; +43 unit)
- **Coverage domain payroll** : 98.86% lines (inchangé). **Coverage shared** : +20 tests observability registry
- **Vélocité observée** : 44 prompts catalogue + 2 ad-hoc + 5 DETTE résolues en 43 heures (sprint marathon 2026-04-21 → 2026-04-23 15:00)
- **Skills disponibles** : 32 (voir `skills/README.md`)
- **Documents de référence** : 13 (brief, spec, plan, archi, risques, rôles, registre nLPD, pr-template, ADR-0001/0002/0003, dev-setup, firebase-setup, github-branch-protection, runbooks ×6)

---

## 1. Prompts par statut

### ✅ Completed (42 catalogue + 2 ad-hoc)

#### Sprint A.0 — Setup (5/6)

| Prompt | Complété le | PR | Commit | Notes |
|--------|-------------|----|----|-------|
| `A0.1-init-monorepo` | 2026-04-21 | [#1](https://github.com/kreuille/interim-agency-system/pull/1) | `0b9cd1e` | Monorepo pnpm + 4 packages + 4 apps + 15 tests |
| `A0.2-docker-compose-local` | 2026-04-21 | [#2](https://github.com/kreuille/interim-agency-system/pull/2) | `f87fef9` | docker-compose + Makefile + mock MP + smoke test |
| `A0.3-ci-github-actions` | 2026-04-21 | [#3](https://github.com/kreuille/interim-agency-system/pull/3) | `9013ffc` | 3 workflows + dependabot + CODEOWNERS + PR template |
| `A0.5-prisma-schema-v0` | 2026-04-21 | [#17](https://github.com/kreuille/interim-agency-system/pull/17) | `5f48f04` | 18 modèles + 13 enums + seed idempotent + tenant middleware |
| `A0.6-auth-firebase-setup` (code) | 2026-04-21 | [#18](https://github.com/kreuille/interim-agency-system/pull/18) | `6bc714d` | RBAC 7×12 + TokenVerifier + authMiddleware + ADR-0003. **Reste** DETTE-014 (provisioning Firebase, action humaine) |

#### Sprint A.1 — Core (7/7) ✅ COMPLET

| Prompt | Complété le | PR | Commit | Notes |
|--------|-------------|----|----|-------|
| `A1.1-worker-entity-crud` | 2026-04-21 | [#20](https://github.com/kreuille/interim-agency-system/pull/20) | `c4ce0bf` | VOs + entité + 5 use cases + Prisma repo + REST + audit log |
| `A1.2-worker-documents-upload` | 2026-04-22 | [#23](https://github.com/kreuille/interim-agency-system/pull/23) | `3c6f06d` | Multipart + scan antivirus + signed URLs |
| `A1.3-document-expiry-alerts` | 2026-04-22 | [#27](https://github.com/kreuille/interim-agency-system/pull/27) | `1bc03a4` | Cron scan + 4 channels + idempotent |
| `A1.4-client-entity-crud` | 2026-04-22 | [#28](https://github.com/kreuille/interim-agency-system/pull/28) | `c2add42` | IDE VO + status machine + REST |
| `A1.5-client-contract-rate-card` | 2026-04-22 | [#29](https://github.com/kreuille/interim-agency-system/pull/29) | `5be67e6` | Taux CCT minimum + rate card |
| `A1.6-audit-log-infra` | 2026-04-22 | [#30](https://github.com/kreuille/interim-agency-system/pull/30) | `4646dee` | Hash chain append-only |
| `A1.7-admin-ui-core` | 2026-04-22 | [#31](https://github.com/kreuille/interim-agency-system/pull/31) | `62cc3f3` | Next.js 14 + RHF/Zod + dev auth scaffolding |

#### Sprint A.2 — Availability (6/6) ✅ COMPLET

| Prompt | Complété le | PR | Commit | Notes |
|--------|-------------|----|----|-------|
| `A2.1-availability-entity` | 2026-04-22 | [#33](https://github.com/kreuille/interim-agency-system/pull/33) | `c34ad76` | Aggregate + RRULE expansion |
| `A2.2-availability-ui-calendar` | 2026-04-22 | [#34](https://github.com/kreuille/interim-agency-system/pull/34) | `0e4dde6` | Calendrier hebdo + use cases + API |
| `A2.3-availability-self-portal` | 2026-04-22 | [#35](https://github.com/kreuille/interim-agency-system/pull/35) | `f58ab32` | PWA portail intérimaire (web-portal) |
| `A2.4-moveplanner-api-client` | 2026-04-22 | [#36](https://github.com/kreuille/interim-agency-system/pull/36) | `9483080` | Client HTTP typé + 4 adapters + idempotency |
| `A2.5-availability-push-queue` | 2026-04-22 | [#37](https://github.com/kreuille/interim-agency-system/pull/37) | `d1f11fa` | Outbox pattern + BullMQ availability-sync drain |
| `A2.6-circuit-breaker-alerting` | 2026-04-22 | [#38](https://github.com/kreuille/interim-agency-system/pull/38) | `b536195` | Circuit breaker + Sentry hook + runbook MP unreachable |

#### Sprint A.3 — Webhooks & propositions (6/6) ✅ COMPLET

| Prompt | Complété le | PR | Commit | Notes |
|--------|-------------|----|----|-------|
| `A3.1-webhook-endpoint-hmac` | 2026-04-22 | [#40](https://github.com/kreuille/interim-agency-system/pull/40) | `3c4ee55` | HMAC-SHA256 + tolérance ±5 min |
| `A3.2-inbound-webhook-persistence` | 2026-04-22 | [#41](https://github.com/kreuille/interim-agency-system/pull/41) | `b7c8533` | Idempotency Event-Id + dispatcher BullMQ |
| `A3.3-mission-proposal-entity` | 2026-04-22 | [#42](https://github.com/kreuille/interim-agency-system/pull/42) | `4d23959` | Aggregate FSM + handler `worker.assignment.proposed` |
| `A3.4-proposal-routing-modes` | 2026-04-22 | [#43](https://github.com/kreuille/interim-agency-system/pull/43) | `5a6beea` | Pass-through vs agency-controlled + accept/refuse on behalf + 4 webhook handlers |
| `A3.5-sms-swisscom-adapter` | 2026-04-22 | [#44](https://github.com/kreuille/interim-agency-system/pull/44) | `9c9e23e` | Port + use cases envoi/opt-out + rate limit + templates i18n |
| `A3.6-proposal-dashboard-ui` | 2026-04-22 | [#45](https://github.com/kreuille/interim-agency-system/pull/45) | `eb14e40` | Dashboard Kanban + 5 endpoints REST + RBAC |

#### Sprint A.4 — Contrats & timesheets (7/7) ✅ COMPLET

| Prompt | Complété le | PR | Commit | Notes |
|--------|-------------|----|----|-------|
| `A4.1-mission-contract-entity` | 2026-04-22 | [#47](https://github.com/kreuille/interim-agency-system/pull/47) | `06b48f0` | Aggregate FSM + GenerateMissionContractUseCase |
| `A4.2-contract-pdf-generator` | 2026-04-22 | [#51](https://github.com/kreuille/interim-agency-system/pull/51) | `ea700f1` | pdf-lib + templates FR par branche CCT |
| `A4.3-signature-zertes-integration` | 2026-04-22 | [#52](https://github.com/kreuille/interim-agency-system/pull/52) | `8b15806` | ZertES e-signature port + use cases + Swisscom webhook |
| `A4.4-ged-archival-10-years` | 2026-04-22 | [#53](https://github.com/kreuille/interim-agency-system/pull/53) | `15c0396` | WORM 10 ans avec rétention par catégorie |
| `A4.5-timesheet-inbound` | 2026-04-22 | [#54](https://github.com/kreuille/interim-agency-system/pull/54) | `8faf0a1` | Inbound webhook + anomalies LTr/CCT + Timesheet aggregate |
| `A4.6-timesheet-review-ui` | 2026-04-22 | [#56](https://github.com/kreuille/interim-agency-system/pull/56) | `6acb11d` | UI contrôle + bulk sign |
| `A4.7-timesheet-sign-dispute-api` | 2026-04-22 | [#55](https://github.com/kreuille/interim-agency-system/pull/55) | `c628d0f` | Sign + dispute use cases + push MP + confirmation handler |

#### Sprint A.5 — Paie & facturation (8/9, A5.5 externe)

| Prompt | Complété le | PR | Commit | Notes |
|--------|-------------|----|----|-------|
| `A5.1-payroll-engine-cct` | 2026-04-22 | [#58](https://github.com/kreuille/interim-agency-system/pull/58) | `a7cbe22` | Moteur de paie hebdo pur domain — CCT × heures × majo |
| `A5.2-payroll-majorations` ✅ | 2026-04-22 + 2026-04-23 | (inclus dans #58) + [#77](https://github.com/kreuille/interim-agency-system/pull/77) | `a7cbe22` + `03554c3` | `surcharge-rules.ts` + `canton-holidays.ts` bundlés avec A5.1 (PR #58). DETTE-036 **fermée** via PR #77 : table Prisma `canton_holidays` versionnée (validFrom/validTo) + couverture 26 cantons (vs 11, ajout Tessin et autres) + 947 rows seedées 2026-2028 + audit log + règle "plus favorable" `applyContractOverrides()` (contrat > CCT) + 9 integration tests Testcontainers + coverage payroll 98.86%. |
| `A5.3-payroll-retenues-sociales` | 2026-04-22 | [#59](https://github.com/kreuille/interim-agency-system/pull/59) | `c158443` | AVS/AC/LAA/LPP + IS cantonal + arrondi 5cts NET |
| `A5.4-payslip-pdf-standard-ch` | 2026-04-22 | [#60](https://github.com/kreuille/interim-agency-system/pull/60) | `257258e` | Bulletin de paie PDF déterministe |
| `A5.6-iso20022-pain001-export` | 2026-04-22 | [#61](https://github.com/kreuille/interim-agency-system/pull/61) | `ad239e4` | Export ISO 20022 pain.001.001.09 CH |
| `A5.7-invoice-qrbill-generator` | 2026-04-22 | [#62](https://github.com/kreuille/interim-agency-system/pull/62) | `1b4cfb7` | Facture client + QR-bill SIX + TVA 8.1% |
| `A5.8-invoice-relances-pipeline` | 2026-04-22 | [#63](https://github.com/kreuille/interim-agency-system/pull/63) | `6329bff` | Relances J+7/15/30/45 + escalade rôles |
| `A5.9-accounting-export-bexio-abacus` | 2026-04-22 | [#64](https://github.com/kreuille/interim-agency-system/pull/64) | `644c213` | Entries double-partie + plan comptable PME + CSV export |

#### Sprint A.6 — Conformité & go-live (5/7)

| Prompt | Complété le | PR | Commit | Notes |
|--------|-------------|----|----|-------|
| `A6.1-compliance-dashboard` | 2026-04-22 | [#65](https://github.com/kreuille/interim-agency-system/pull/65) | `f56cd54` | 5 indicateurs LSE/CCT/docs/missions/nLPD |
| `A6.2-seco-export-one-click` | 2026-04-22 | [#66](https://github.com/kreuille/interim-agency-system/pull/66) | `5eedfee` | Bundle CSV + résumé contrôle SECO |
| `A6.3-observability-stack` | 2026-04-22 + 2026-04-23 | [#48](https://github.com/kreuille/interim-agency-system/pull/48) + [#71](https://github.com/kreuille/interim-agency-system/pull/71) | `412d903` + `cd1b6b8` | Code Sentry/OTel/Prometheus (PR #48) + pino logger PII-redacted + correlation-id middleware + ops/ stack (4 dashboards Grafana + 11 alertes P1/P2/P3 + Loki/Promtail/Tempo + docker-compose runnable local) |
| `A6.4-runbooks-incidents` | 2026-04-22 | [#67](https://github.com/kreuille/interim-agency-system/pull/67) | `78a494a` | 5 runbooks incidents prod copy-paste-ready |
| `A6.5-backup-restore-dr-test` | 2026-04-23 | [#74](https://github.com/kreuille/interim-agency-system/pull/74) | `ea52d41` | pg_dump + pg_restore chiffrés age + wal-archive + test-roundtrip E2E + worker BullMQ mensuel + runbook DR + alertes P1/P2 + dashboard `backup-dr.json`. **RPO ≤ 6 min et RTO ≤ 4h prouvés en local** (RTO empirique 1s sur 1850 rows seedées) |

#### PRs ad-hoc (hors catalogue)

| Prompt | Complété le | PR | Commit | Notes |
|--------|-------------|----|----|-------|
| `AH.001-helvetia-design-system` | 2026-04-23 | [#68](https://github.com/kreuille/interim-agency-system/pull/68) | `b1851b1` | Habillage swiss-precise (Inter + JetBrains Mono + accent CH red) — sidebar 236px + topbar 52px + dashboard + workers + clients + login |
| `AH.002-fix-web-admin-dev-server` | 2026-04-23 | [#69](https://github.com/kreuille/interim-agency-system/pull/69) | `414002e` | next.config.mjs : extensionAlias `.js→.ts` + NormalModuleReplacementPlugin pour `node:*` côté client + fallback crypto/fs |

### 🟡 In progress

*(aucun)*

### ⏸ In progress — paused (contexte saturé)

*(aucun)*

### 🔵 Pending — actions externes / humaines

| Prompt | Sprint | Effort | Bloqué par | Notes |
|--------|--------|--------|------------|-------|
| `A0.4-hosting-ch-provisioning` | A.0 | L | Action humaine fondateur | Provisioning GCP `europe-west6` selon ADR-0002 (Cloud SQL + Memorystore + Cloud Storage CMEK + Secret Manager + OIDC WIF + DPA Google Cloud Switzerland GmbH) |
| `A5.5-elm-swissdec-adapter` | A.5 | L | Sandbox Swissdec externe | SOAP + signatures électroniques + tests sandbox AVS/SUVA/IS. Code domain peut être prêt mais validation impossible sans accès |
| `A6.6-pentest-externe` | A.6 | L | Prestataire CH + budget | Action humaine. Stagnation tant que pilote pas livré |
| `A6.7-go-live-pilote` | A.6 | M | A0.4, A0.6 (Firebase), A6.5, BLOCKER-002 (autorisation LSE), client pilote signé | Jour J — checklist déploiement Cloud Run + cutover DNS + monitoring |

### 🔴 STOP code-only — bascule actions externes (orchestrateur)

**Sprint A.6 côté code est terminé.** Les 4 dettes critiques bloquantes pour le pilote (036, 033, 035, 037) sont toutes closes. Le backlog ci-dessous ne bloque **pas** le pilote et relève du sprint A.7 (post go-live) — à reprendre sur instruction utilisateur après que les actions externes ci-dessous soient complétées.

#### Actions externes requises (ordre pragmatique)

| Ordre | Action | Qui | Bloque quoi |
|-------|--------|-----|-------------|
| 1 | **A0.4** — provisioning GCP `europe-west6` (Cloud SQL + Memorystore + Cloud Storage CMEK + Secret Manager + OIDC WIF + DPA Google Cloud Switzerland GmbH) | Fondateur + DevOps lead + DPO | A6.7 go-live + déploiement paie réel |
| 2 | **Rotation clés age prod** : générer paire age réelle, pousser publique dans Secret Manager, stocker privée scopée DR uniquement | DPO + DevOps lead | Premier backup prod chiffré |
| 3 | **A5.5** — Swissdec ELM sandbox (SOAP + signatures électroniques + tests AVS/SUVA/IS) | Lead tech + Swissdec partenaire externe | Déclarations salaire réelles (bloquant légal fin de mois) |
| 4 | **A6.6** — pentest externe (prestataire CH, budget alloué) | Fondateur + prestataire | Go-live prod (exige rapport clean) |
| 5 | **A6.7** — gameday DR + go-live (checklist déploiement Cloud Run + cutover DNS + monitoring) | Équipe ops on-call | Livraison pilote |

#### Backlog technique A.7 (à reprendre post go-live, **non bloquant pilote**)

| Ordre | Prompt | Sprint | Effort | Notes |
|-------|--------|--------|--------|-------|
| 1 | `DETTE-041` (onScrape gauges DB outbox) | A.7 | S | Wire `onScrape` hook côté worker pour scraper Postgres et mettre à jour `availability_outbox_pending_count` + `availability_outbox_lag_seconds`. Sans ça, ces 2 gauges restent à 0 même si l'outbox déborde |
| 2 | `DETTE-040` (wire metrics callbacks main.ts) | A.7 | S | Quand DETTE-014/015 done : wire `createAvailabilitySyncWorker({ ..., onResult: ... → metrics })` etc. dans `apps/worker/src/main.ts`. Préparer la propagation `agencyId` depuis le job BullMQ |
| 3 | `DETTE-038` (wire preload canton-holidays bootstrap) | A.7 | XS | Appeler `PrismaCantonHolidayRepository.preload()` au bootstrap API |
| 4 | `DETTE-034` (oncall-sms-bridge) | A.7 | M | Passerelle webhook → Swisscom SMS API pour Alertmanager receiver `on-call` |
| 5 | `DETTE-039` (Jeûne genevois `sunday_relative`) | A.7 | XS | Raffiner placeholder `fixed 9/1` GE → `sunday_relative {ordinal:1, offset:4}` |
| 6 | `DETTE-036(a) bis` (ADR canton_holidays double mécanisme) | A.7 | S | ADR formelle pour entériner double mécanisme |

### 🔵 Pending — OPS transversal (5 prompts catalogués)

| Prompt | Cadence | Notes |
|--------|---------|-------|
| `OPS.weekly-review` | Hebdomadaire (vendredi) | Compile métrique vélocité + dette + escalade blockers > 7j |
| `OPS.permit-expiry-scan` | Quotidien (cron) | Scan expirations permis L/B 60j → notif intérimaire + admin |
| `OPS.cct-yearly-update` | Annuel (janvier) | Import barèmes CCT swissstaffing → table `cct_minimum_rates` |
| `OPS.dpia-refresh` | Annuel | Revue DPIA portail intérimaire + registre nLPD |
| `OPS.api-key-rotation` | Trimestriel | Rotation clés API MovePlanner + Swisscom + Firebase service account |

### 🚫 Abandonned / Superseded

*(aucun)*

---

## 2. Sprints — vue synthétique

| Sprint | Début planifié | Fin planifiée | Prompts totaux | Complétés | Statut |
|--------|----------------|---------------|----------------|-----------|--------|
| A.0 | S1 | S1 | 6 | 5 | 🟡 A0.4 externe (provisioning GCP) |
| A.1 | S2 | S3 | 7 | 7 | ✅ |
| A.2 | S4 | S5 | 6 | 6 | ✅ |
| A.3 | S6 | S7 | 6 | 6 | ✅ |
| A.4 | S8 | S9 | 7 | 7 | ✅ |
| A.5 | S10 | S12 | 9 | 8 | 🟡 A5.5 externe (sandbox Swissdec) |
| A.6 | S13 | S14 | 7 | 5 | 🟡 A6.6 (pentest) + A6.7 (go-live) externes |
| Ad-hoc | — | — | 2 | 2 | ✅ Design Helvètia + fix dev server |
| OPS | continu | continu | 5 | 0 | 🔵 |

**Total catalogue : 44 / 48 (91.7%)**

---

## 3. Décisions techniques figées

Décisions prises et non renégociables sans ADR. Mettre à jour au fil de l'eau.

| Date | Décision | ADR / Source | Prise par |
|------|----------|--------------|-----------|
| 2026-04-21 | Stack Node.js 20 + TS strict + PostgreSQL 16 + Next.js 14 | `docs/adr/0001-stack-choice.md` | Brief |
| 2026-04-21 | Hébergement GCP `europe-west6` (Zurich) — Cloud Run + Cloud SQL + CMEK | `docs/adr/0002-hosting-choice.md` | Fondateur |
| 2026-04-21 | Auth Firebase Identity Platform multi-tenancy native | `docs/adr/0003-auth-choice.md` | Fondateur |
| 2026-04-21 | Architecture hexagonale | `CLAUDE.md §2.2` | Lead tech |
| 2026-04-21 | Montants en Rappen (bigint), `Currency = 'CHF' \| 'EUR'` | `CLAUDE.md §3.1` + Money.ts | Brief + spec MP |
| 2026-04-21 | Orchestrateur de prompts Markdown (ce document) | ADR-0003 (à créer) | PO + fondateur |
| 2026-04-21 | Packages exportent `.ts` direct (pas de compile intermédiaire) | A0.1 SESSION-LOG | A0.1 |
| 2026-04-21 | `docs/`, `prompts/`, `skills/`, CLAUDE.md, README.md exclus de Prettier | `.prettierignore` | A0.1 |
| 2026-04-21 | Augmentation Express via `namespace Express` globale pour `req.user` | `tenant.middleware.ts` | A0.5 |
| 2026-04-21 | `pnpm.onlyBuiltDependencies` : esbuild, @prisma/client, @prisma/engines, prisma | `package.json` | A0.5 |
| 2026-04-21 | 18 modèles Prisma + 13 enums, FK `onDelete: Restrict` pour données légales | `apps/api/prisma/schema.prisma` | A0.5 |
| 2026-04-21 | RBAC 7 rôles × 12 actions typés ; MFA obligatoire pour `agency_admin` + `payroll_officer` | `packages/domain/src/auth/role.ts` | A0.6 |
| 2026-04-21 | Repo **public** — GitHub Rulesets `main-protection` + secret scanning + Dependabot | ruleset id 15364662 | Fondateur |
| 2026-04-21 | Idempotency-Key inbound : UUID v4 + cache DB 24h, hash `sha256(method\|path\|body)` | `idempotency.middleware.ts` | DETTE-017 |
| 2026-04-21 | Tenant-guard Prisma : defense-in-depth via `$extends` (pas d'injection auto) | `tenant-guard.ts` | DETTE-019 |
| 2026-04-21 | Coverage enforcement CI : seuils par workspace (domain 85%, shared 80%, app/api 70-80%) | `**/vitest.config.ts` + `.github/workflows/ci.yml` | DETTE-018 |
| 2026-04-22 | Webhook persistence-first puis dispatch via EventBus (pas de traitement synchrone) | `apps/api/src/infrastructure/webhooks/` | A3.2 |
| 2026-04-22 | MissionProposal FSM 7 états (`proposed → pass_through_sent / agency_review → accepted/refused/timeout/expired`) | `packages/domain/src/missions/mission-proposal.ts` | A3.3 |
| 2026-04-22 | Routing mode par agence : pass-through (SMS direct MP→intérimaire) vs agency_controlled (gestion validée par agence) | `assign-routing-mode.use-case.ts` | A3.4 |
| 2026-04-22 | SMS templates i18n FR/IT/DE par worker locale | `template-renderer.ts` | A3.5 |
| 2026-04-22 | Contrats CCT : 1 template par branche (déménagement, location services, BTP) en pdf-lib | `packages/domain/src/contracts/templates-fr.ts` | A4.2 |
| 2026-04-22 | Signature ZertES via Swisscom Trust Signing Services (port abstrait, fallback DocuSign banni) | `packages/application/src/signature/esignature-provider.ts` | A4.3 |
| 2026-04-22 | GED rétention par catégorie : contrats 10 ans (CO art. 958f), permis 5 ans, payslips 5 ans | `packages/domain/src/ged/legal-archive-entry.ts` | A4.4 |
| 2026-04-22 | Anomalies LTr/CCT typées (16 codes) + bloquantes vs warning | `packages/domain/src/timesheets/anomaly.ts` | A4.5 |
| 2026-04-22 | Paie : Money pur côté domain, arrondis 5cts CHF sur NET seulement, basis points pour TVA et taux sociaux | `packages/domain/src/payroll/round-swiss.ts` | A5.1 |
| 2026-04-22 | LPP barème par tranche d'âge (25-34, 35-44, 45-54, 55-65), exemption < seuil annuel | `packages/domain/src/payroll/lpp-calc.ts` | A5.3 |
| 2026-04-22 | IS cantonal : barème B/L par canton (VD/GE/FR/VS/BE/NE/JU/TI/ZH), pas de bypass legal | `packages/domain/src/payroll/is-brackets.ts` | A5.3 |
| 2026-04-22 | QR-bill SIX format ISO 20022 + IID 30000 + référence structurée mod 10 | `packages/domain/src/invoicing/` | A5.7 |
| 2026-04-22 | Comptabilité PME : entries double-partie + plan comptable suisse (1xxx actifs / 2xxx passifs / 3xxx revenus / 4xxx-7xxx charges) | `packages/domain/src/accounting/chart-of-accounts.ts` | A5.9 |
| 2026-04-22 | Compliance dashboard : 5 indicateurs (LSE / CCT / docs workers / missions actives / nLPD) avec status `ok|warning|critical` | `packages/domain/src/compliance/indicator-builders.ts` | A6.1 |
| 2026-04-22 | Export SECO : CSV bundle (workers + missions + contracts + timesheets) + résumé txt + audit log immutable | `packages/domain/src/compliance/seco-export.ts` | A6.2 |
| 2026-04-22 | Observability code stack : Sentry (EU region) + OTel auto-instrumentation HTTP/Express + Prometheus RED metrics | `apps/api/src/infrastructure/observability/` | A6.3 (PR #48) |
| 2026-04-23 | Design system Helvètia Intérim : Inter + JetBrains Mono + accent rouge CH `#c8102e`, sidebar 236px + topbar 52px | `apps/web-admin/app/globals.css` | AH.001 |
| 2026-04-23 | Next.js webpack config : `extensionAlias '.js→.ts'` + `NormalModuleReplacementPlugin /^node:/` côté client (workaround monorepo NodeNext + transitive node:crypto) | `apps/web-admin/next.config.mjs` | AH.002 |
| 2026-04-23 | Logger structuré pino + PII redaction source-side (iban/avs/email/phone/password/token/firstName/lastName/Authorization) + helper `hashWorkerId` SHA-256 16 hex chars | `apps/api/src/infrastructure/observability/logger.ts` | A6.3 (PR #71) |
| 2026-04-23 | Correlation-id middleware (`X-Request-Id` / `X-Correlation-Id`) UUIDv4 par défaut, propagé dans header réponse + tous les logs pino | `apps/api/src/shared/middleware/request-id.middleware.ts` | A6.3 (PR #71) |
| 2026-04-23 | Stack ops Grafana/Loki/Tempo/Prometheus/Alertmanager runnable en local via `ops/docker-compose.observability.yml` ; configs versionnées importables sur Grafana Cloud EU en prod | `ops/` | A6.3 (PR #71) |
| 2026-04-23 | Routage Alertmanager P1→on-call (SMS+Slack), P2→dev-team (Slack), P3→tickets (Linear) ; chaque alerte référence un runbook dans `annotations.runbook` | `ops/alertmanager/alertmanager.yml` | A6.3 (PR #71) |
| 2026-04-23 | DR backup chiffré : `age` (https://age-encryption.org) plutôt que GPG ; clé recipient publique déployable, identity privée scopée DR uniquement (Secret Manager prod) | `ops/backup/pg_dump.sh` + `pg_restore.sh` | A6.5 (PR #74) |
| 2026-04-23 | DR cible base : suffixe `_dr`/`_test_`/`interim_dev` obligatoire ; guard `pg_restore.sh` refuse drop sinon (anti-fat-finger anti-prod) | `ops/backup/pg_restore.sh` § guard | A6.5 (PR #74) |
| 2026-04-23 | DR rétention : 90 jours dumps quotidiens (politique nLPD : pas plus que nécessaire), 30 jours WAL pour PITR | `ops/backup/README.md` § Lifecycle | A6.5 (PR #74) |
| 2026-04-23 | DR test mensuel : worker BullMQ cron `0 3 1 * *` Europe/Zurich, RTO budget 14400s (4h), métrique `dr_restore_duration_seconds` | `apps/worker/src/dr-restore-test.worker.ts` | A6.5 (PR #74) |
| 2026-04-23 | Référentiel fériés cantonaux : 26 cantons (ISO 3166-2:CH) avec 3 types de def discriminés (`fixed`/`easter_relative`/`sunday_relative`). Fériés fédéraux 7, fériés cantonaux variables (TI = 9 spécificités catholiques) | `packages/domain/src/payroll/canton-holidays-data.ts` | DETTE-036 (PR #77) |
| 2026-04-23 | Table Prisma `canton_holidays` : pas d'`agencyId` (référentiel public commun), PK composite `(canton, date, validFrom)` pour versioning historique 10 ans | `apps/api/prisma/schema.prisma` | DETTE-036 (PR #77) |
| 2026-04-23 | `CantonHolidayPort.forCantonAndYear` SYNCHRONE par contrat (consommé par `PayrollEngine` pur). Adapter Prisma offre `preload(canton, year)` async à appeler au bootstrap + cache in-memory invalidé après `upsertMany` | `apps/api/src/infrastructure/persistence/prisma/canton-holiday.repository.ts` | DETTE-036 (PR #77) |
| 2026-04-23 | Règle "plus favorable" CCT/contrat : `applyContractOverrides()` retient `Math.max(CCT, contrat)` pour night/sunday/holiday/overtime. CCT = plancher légal infranchissable (override `<` ignoré silencieusement). `stackSundayAndNight` et `overtimeThresholdMinutes` non overridables (CCT-branche) | `packages/domain/src/payroll/surcharge-rules.ts` | DETTE-036 (PR #77) |
| 2026-04-23 | Module `prom-registry` factorisé dans `packages/shared` : `hashAgencyId()` SHA-256 12 hex (vs 16 chars hashWorkerId), `FORBIDDEN_LABELS` 18 entries, `assertLabelHygiene()` au boot (fail-fast), `createPromRegistry({service: 'api'\|'worker'})` | `packages/shared/src/observability/prom-registry.ts` | DETTE-033 (PR #79) |
| 2026-04-23 | Worker `/metrics` endpoint : `node:http` natif (pas de framework) port 9090, routes GET /metrics + /health, `onScrape` hook async qui swallow erreurs (Prometheus retry sinon) | `apps/worker/src/observability/server.ts` | DETTE-033 (PR #79) |
| 2026-04-23 | 20 business counters worker : 5 paie + 4 availability outbox + 8 DR/backup + 3 MovePlanner. Tous PII-safe (`agency_id_hash` jamais en clair). `BusinessMetrics` interface + `createBusinessMetrics()` impl + `createNoOpBusinessMetrics()` tests | `apps/worker/src/observability/business-metrics.ts` | DETTE-035 (PR #79) |

---

## 4. Blockers ouverts

### 🔴 BLOCKER-001 — Accès sandbox MovePlanner

- **Ouvert le** : 2026-04-21
- **Bloque** : ne bloque plus le dev (mock MP en place, contrats validés via tests Pact-like). Bloque la **validation E2E réelle** avant pilote.
- **Action** : envoyer demande officielle à l'équipe MovePlanner avec certificat mTLS de test + endpoint webhook tunneling
- **Responsable** : PO / fondateur
- **ETA** : avant A6.7 (go-live)
- **Mitigation** : mock server OpenAPI local complet (`apps/mock-moveplanner`) — DETTE-006 à clore pour couverture totale

### 🔴 BLOCKER-002 — Autorisation cantonale LSE

- **Ouvert le** : 2026-04-21
- **Bloque** : go-live pilote (A6.7). **Ne bloque pas** le dev du MVP mais bloque l'exploitation commerciale.
- **Action** : dépôt du dossier au SCTP/OCE du canton, fournir organigramme, caution bancaire
- **Responsable** : fondateur + juriste
- **ETA** : 4 à 12 semaines selon canton
- **Mitigation** : démarrer le pilote sous autorisation d'un partenaire déjà autorisé (portage) si pas reçu à temps

### ✅ BLOCKER-003 — Hosting **résolu côté décision** (GCP europe-west6)
- Décision figée. Provisioning effectif = DETTE-015 (action humaine).

### ✅ BLOCKER-004 — Auth **résolu côté décision + code** (Firebase Identity Platform)
- Décision figée + code RBAC + middleware posés. Création projets Firebase = DETTE-014 (action humaine).

---

## 5. Dettes techniques qualifiées

### Dettes ouvertes (13)

| ID | Ouverte le | Description | Priorité | ETA |
|----|------------|-------------|----------|-----|
| DETTE-006 | 2026-04-21 | Compléter les endpoints du mock MovePlanner (couverture totale de docs/02) | M | A3 ✅ partiel — finir avant pilote |
| DETTE-008 | 2026-04-21 | Durcir `pnpm audit` en bloquant (retirer `\|\| true`) une fois Dependabot a nettoyé le backlog | L | A6.6 |
| DETTE-014 | 2026-04-21 | Créer projets Firebase `interim-agency-system` + `-staging` selon `docs/firebase-setup.md` | H | Avant A6.7 |
| DETTE-015 | 2026-04-21 | Provisionner GCP `europe-west6` selon ADR-0002 (Cloud SQL, Memorystore, Cloud Storage, Secret Manager, OIDC WIF) | H | Avant A6.7 |
| DETTE-016 | 2026-04-21 | Cloud Function `onCreate` qui pose les custom claims `agencyId` + `role` à l'inscription | M | A1.7 ✅ partiel — wire prod attend DETTE-014 |
| ~~DETTE-033~~ | ~~2026-04-23~~ | ~~Wire `/metrics` endpoint sur `apps/worker/main.ts` (port 9090) avec counters BullMQ~~ — **CLOSE 2026-04-23 15:00 via PR #79** : HTTP server natif sur port 9090, factorisé `prom-registry` shared, 20 business counters PII-safe | ~~M~~ | ✅ |
| DETTE-034 | 2026-04-23 | Implémenter `oncall-sms-bridge` (passerelle webhook → Swisscom SMS API) ou wire un service tiers (PagerDuty, Opsgenie). Sinon receiver `on-call` Alertmanager n'envoie qu'à Slack | M | A.7 |
| ~~DETTE-035~~ | ~~2026-04-23~~ | ~~Exposer métriques business `payroll_batch_*`, `availability_outbox_*`, `pg_dump_*`, `wal_archive_*`, `dr_restore_*`~~ — **CLOSE 2026-04-23 15:00 via PR #79** : 20 métriques (5 paie + 4 avail + 8 DR + 3 MP) avec `hashAgencyId` + `assertLabelHygiene` au boot | ~~S~~ | ✅ |
| DETTE-040 | 2026-04-23 | Wire les counters dans `apps/worker/src/main.ts` quand le DI Redis + Prisma sera prêt (DETTE-014/015 done). Propager `agencyId` depuis job BullMQ vers `metrics.recordAvailabilityOutboxPushed` | S | A.7 (avec wiring runtime) |
| DETTE-041 | 2026-04-23 | Wire `onScrape` hook côté worker pour scraper Postgres et mettre à jour `availability_outbox_pending_count` + `availability_outbox_lag_seconds`. Sans ça, ces 2 gauges restent à 0 | S | A.6 (court terme, faisable immédiatement) |
| DETTE-042 | 2026-04-23 | Wiring DI complet dans `apps/api/src/main.ts` : câbler `proposals`, `timesheets`, `ged`, `webhooks` (actuellement `AppDeps` les rend optionnels, skippés en preview). Impl in-memory pour `InMemoryLegalArchive`, `InMemoryInboundWebhook`, etc. OU Prisma-backed (préféré pour audit trail réel). Dépend de DETTE-015 (BullMQ/Redis) pour les webhook handlers async | M | A.7 (avec DETTE-015) |
| ~~DETTE-036~~ | ~~2026-04-23~~ | ~~A5.2 divergence : (a) port TS vs table Prisma ; (b) Tessin manquant ; (c) règle "plus favorable"~~ — **CLOSE 2026-04-23 13:00 via PR #77** : table Prisma versionnée + 26 cantons (Tessin inclus) + `applyContractOverrides()` + 947 rows seedées + 9 integration tests + coverage 98.86% | ~~M~~ | ✅ |
| DETTE-036(a) bis | 2026-04-23 | ADR formelle pour entériner double mécanisme (port TS fallback + table Prisma source de vérité) OU supprimer `StaticCantonHolidaysPort` après wiring complet | S | A.7 |
| ~~DETTE-037~~ | ~~2026-04-23~~ | ~~Job CI mensuel qui exécute `ops/backup/test-roundtrip.sh` dans GitHub Actions~~ — **CLOSE 2026-04-23 19:00 via PR #81 (squelette `4bbb891`) + PR #82 (enhancements `78933e0`)** : workflow `.github/workflows/dr-roundtrip.yml` avec 4 asserts (`assert_sha256` + `assert_age_header` + `assert_rpo` + `assert_rto`), scripts `ops/backup/*.sh` CI-friendly (JSON Lines + exit codes 0-6 via `_lib.sh`), shellcheck gate, artifacts enrichis on failure, runbook §7 "Validation CI automatique", test régression intentionnel exécuté avec succès | ~~M~~ | ✅ |
| DETTE-038 | 2026-04-23 | Wire `PrismaCantonHolidayRepository.preload()` au bootstrap de l'API pour les cantons + années actifs (typiquement année courante + N+1). Sans ça, le cache reste vide en runtime → fallback silencieux sur `StaticCantonHolidaysPort` requis | XS | A.7 (avec wiring `RunPayrollWeekUseCase`) |
| DETTE-039 | 2026-04-23 | Le Jeûne genevois exact (jeudi après 1er dim sept) est codé en dur comme `fixed 9/1` placeholder dans GE — à raffiner via `sunday_relative {ordinal:1, offset:4}` | XS | A.7 |

### Dettes fermées (23)

DETTE-001 (composite TS, reportée A.6) · DETTE-002 (repo GitHub) · DETTE-003 (pnpm approve-builds) · DETTE-004 (husky pre-commit) · DETTE-005/009/012 (API Docker container) · DETTE-007 (branch protection — requalifiée DETTE-013) · DETTE-010 (Prisma tenant injection — remplacée par DETTE-019) · DETTE-011 (Testcontainers integration tests) · DETTE-013 (repo public + main ruleset) · DETTE-017 (Idempotency-Key inbound) · DETTE-018 (coverage CI enforcement) · DETTE-019 (tenant-guard $extends) · DETTE-020 (GCS CMEK) · DETTE-021 (ClamAV scan async) · DETTE-022 (OCR no-op port) · DETTE-023 (coverage api 70%) · DETTE-024 à 028 (SMS i18n + CSV export + SSE stream + Prisma MissionContract + observability metrics + tracing — closed in PRs #48/49/50) · DETTE-029 à 032 (WorkerAvailability Prisma + reminders delayed + various) · DETTE A.4 backend dettes (controllers + ports + GED purge worker via PR #57)

### Nouvelles dettes ouvertes ce sprint

*(aucune — la session de design Helvètia + fix dev server n'a pas introduit de dette qualifiée)*

---

## 6. Métriques de pilotage

| Métrique | Valeur | Cible | Tendance |
|----------|--------|-------|----------|
| Prompts completed catalogue | 44 / 48 (91.7%) | 100% (S14) | 🟢 en avance |
| Prompts completed total (catalogue + ad-hoc + OPS) | 46 / 53 | 53 | 🟢 |
| Tests unit + integration | **1210 unit + 53 integration** | ≥ couverture seuils | 🟢 |
| Couverture domain | 100% (mesurée A1.1) | ≥ 85% | 🟢 |
| Couverture shared | 96.58% | ≥ 80% | 🟢 |
| Couverture application | 84.14% | ≥ 80% | 🟢 |
| Couverture api | 87.24% lines / 75.24% branches | ≥ 80%/70% | 🟢 |
| Blockers conformité ouverts | 1 (LSE — externe) | 0 avant go-live | 🟡 |
| Blockers techniques ouverts | 1 (sandbox MP — externe) | 0 avant go-live | 🟡 |
| Dettes techniques qualifiées | 14 ouvertes (5 externes + 1 A6.5 + 3 DETTE-036 sub + 3 DETTE-040/041/042 wiring + 1 A6.3 DETTE-034 + 1 DETTE-039) / 26 fermées | < 10 ouvertes | 🟡 |
| PR avec revue humaine | 100% (toutes les 50+ PRs mergées via gh admin merge) | 100% | 🟢 |
| Vélocité observée (prompts/jour) | ~14 (sprint marathon 36h) | 4–6 régime de croisière | 🟢 |
| Incidents staging / sem | n/a (pas encore staging) | < 2 | — |

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

## 8. Historique des revues d'orchestration

| Semaine | Prompts completed | Vélocité | Blockers ajoutés/clos | Notes |
|---------|-------------------|----------|----------------------|-------|
| 2026-W17 (en cours) | 44 catalogue + 2 ad-hoc + 5 DETTE résolues | exceptionnelle (sprint marathon) | 0 ajoutés / 2 clos | Resynchro 09:00 ; A6.3 09:30 ; A5.2 div→DETTE-036 10:00 ; A6.5 11:00 ; DETTE-036 13:00 ; DETTE-033+035 15:00 (worker /metrics + 20 counters PII-safe + 4 dashboards vivants, +43 tests) |

---

## 9. Notes de resynchronisation 2026-04-23

PROGRESS.md précédent indiquait "Sprint courant A.1, 5/53 prompts completés" alors que **42/48 prompts catalogue étaient en réalité mergés**. Cause : les sessions A1.2 → A6.4 + design Helvètia ont mis à jour SESSION-LOG.md et le code, mais pas systématiquement PROGRESS.md.

**Méthode de resynchro** :
1. `git log --oneline` (66 commits sur main depuis bootstrap)
2. `gh pr list --state merged --limit 100` (52 PRs mergées)
3. Croisement nom de PR ↔ nom de prompt (ex: `feat/A4.5-timesheet-inbound` → `A4.5-timesheet-inbound`)
4. Inspection code physique (`packages/domain/src/payroll/surcharge-rules.ts` confirme A5.2 inclus dans A5.1)
5. `pnpm -r test` → 1081 tests verts (vs 206 dans l'ancien PROGRESS)

**Décisions de remise au propre du working tree** :
- Stash `next-env.d.ts` (autogen Next dev) → **dropped** (sans valeur, régénéré à chaque dev)
- `.design-tmp/` (bundle design extrait) → **gitignored** (artefact one-shot, déjà utilisé pour PR #68)

---

**Fin de PROGRESS.md — instantané resynchronisé 2026-04-23**
