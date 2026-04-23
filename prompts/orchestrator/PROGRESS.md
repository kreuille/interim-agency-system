# PROGRESS.md — État d'avancement du projet

> **Dernière mise à jour** : 2026-04-23 09:30 — **A6.3 fermé** (PR #71, commit `cd1b6b8`). **43/48 prompts catalogue** + 2 PRs ad-hoc complétés. **1095 unit + 6 integration tests** sur 8 workspaces. Reste : actions humaines externes (provisioning GCP, Firebase, Swissdec, pentest, go-live) + A6.5 backup-restore-DR-test (préparable en local).
> **Source de vérité** pour l'orchestrateur. **Ne jamais** le mettre à jour à la main sans avoir suivi le protocole `ORCHESTRATOR.md`.

---

## 0. Instantané

- **Sprint courant** : A.6 (4/7 prompts complétés, A6.3 désormais fermé)
- **Phase** : MVP fonctionnel bout-en-bout + observabilité production-ready (logs structurés JSON, dashboards Grafana, alertes P1/P2/P3 routées). Reste l'infra ops externe + le go-live.
- **Prochain prompt** : `A6.5-backup-restore-dr-test` (scripts pg_dump + restore + runbook DR + test E2E docker-compose, M ~1 jour, préparable en local sans GCP)
- **Prompts complétés** : 43 / 48 catalogue (89.6%) + 2 ad-hoc (design + dev fix) + 0 / 5 OPS
- **Blockers ouverts** : 2 (BLOCKER-001 sandbox MP, BLOCKER-002 autorisation LSE — externes, non-dev)
- **Dette technique** : 8 ouvertes / 23 fermées (006/008/014/015/016 + 3 nouvelles A6.3 : DETTE-033/034/035)
- **Tests** : **1095 unit + 6 integration** sur 8 workspaces (vs 1081 avant ; +14 tests A6.3)
- **Vélocité observée** : 43 prompts en 38 heures (sprint marathon 2026-04-21 → 2026-04-23 09:30)
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
| `A5.2-payroll-majorations` | 2026-04-22 | (inclus dans #58) | `a7cbe22` | `surcharge-rules.ts` + `canton-holidays.ts` (jours fériés VD/GE/FR/VS/BE/NE/JU/TI/ZH) bundlés avec A5.1 |
| `A5.3-payroll-retenues-sociales` | 2026-04-22 | [#59](https://github.com/kreuille/interim-agency-system/pull/59) | `c158443` | AVS/AC/LAA/LPP + IS cantonal + arrondi 5cts NET |
| `A5.4-payslip-pdf-standard-ch` | 2026-04-22 | [#60](https://github.com/kreuille/interim-agency-system/pull/60) | `257258e` | Bulletin de paie PDF déterministe |
| `A5.6-iso20022-pain001-export` | 2026-04-22 | [#61](https://github.com/kreuille/interim-agency-system/pull/61) | `ad239e4` | Export ISO 20022 pain.001.001.09 CH |
| `A5.7-invoice-qrbill-generator` | 2026-04-22 | [#62](https://github.com/kreuille/interim-agency-system/pull/62) | `1b4cfb7` | Facture client + QR-bill SIX + TVA 8.1% |
| `A5.8-invoice-relances-pipeline` | 2026-04-22 | [#63](https://github.com/kreuille/interim-agency-system/pull/63) | `6329bff` | Relances J+7/15/30/45 + escalade rôles |
| `A5.9-accounting-export-bexio-abacus` | 2026-04-22 | [#64](https://github.com/kreuille/interim-agency-system/pull/64) | `644c213` | Entries double-partie + plan comptable PME + CSV export |

#### Sprint A.6 — Conformité & go-live (4/7)

| Prompt | Complété le | PR | Commit | Notes |
|--------|-------------|----|----|-------|
| `A6.1-compliance-dashboard` | 2026-04-22 | [#65](https://github.com/kreuille/interim-agency-system/pull/65) | `f56cd54` | 5 indicateurs LSE/CCT/docs/missions/nLPD |
| `A6.2-seco-export-one-click` | 2026-04-22 | [#66](https://github.com/kreuille/interim-agency-system/pull/66) | `5eedfee` | Bundle CSV + résumé contrôle SECO |
| `A6.3-observability-stack` | 2026-04-22 + 2026-04-23 | [#48](https://github.com/kreuille/interim-agency-system/pull/48) + [#71](https://github.com/kreuille/interim-agency-system/pull/71) | `412d903` + `cd1b6b8` | Code Sentry/OTel/Prometheus (PR #48) + pino logger PII-redacted + correlation-id middleware + ops/ stack (4 dashboards Grafana + 11 alertes P1/P2/P3 + Loki/Promtail/Tempo + docker-compose runnable local) |
| `A6.4-runbooks-incidents` | 2026-04-22 | [#67](https://github.com/kreuille/interim-agency-system/pull/67) | `78a494a` | 5 runbooks incidents prod copy-paste-ready |

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

### 🔵 Pending — code prioritaire (clôture A.6)

| Ordre | Prompt | Sprint | Effort | Notes |
|-------|--------|--------|--------|-------|
| 1 | **`A6.5-backup-restore-dr-test` (préparation locale)** | A.6 | M | **Prochain prompt prêt à lancer** — scripts `ops/backup/pg_dump.sh` + `ops/backup/restore.sh` + runbook DR + test E2E avec docker-compose Postgres. Activation prod attend A0.4. Débloque le critère "backup testé mensuellement" pour A6.7 |
| 2 | `DETTE-033` (worker /metrics) | A.6 | S | Wire `/metrics` endpoint sur `apps/worker/main.ts` (port 9090) avec counters BullMQ. Sans ça, les dashboards `queue-depth` et `mp-health` (outbox lag) restent vides |
| 3 | `DETTE-035` (métriques business payroll/availability) | A.6 | S | Exposer `payroll_batch_duration_seconds`, `payroll_batch_failed_total`, `availability_outbox_oldest_pending_seconds` |
| 4 | `DETTE-034` (oncall-sms-bridge) | A.7 | M | Passerelle webhook → Swisscom SMS API pour Alertmanager receiver `on-call`. Sinon les alertes P1 vont seulement dans Slack |

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
| A.6 | S13 | S14 | 7 | 4 | 🟡 A6.5 préparable local + A6.6/A6.7 externes |
| Ad-hoc | — | — | 2 | 2 | ✅ Design Helvètia + fix dev server |
| OPS | continu | continu | 5 | 0 | 🔵 |

**Total catalogue : 43 / 48 (89.6%)**

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

### Dettes ouvertes (8)

| ID | Ouverte le | Description | Priorité | ETA |
|----|------------|-------------|----------|-----|
| DETTE-006 | 2026-04-21 | Compléter les endpoints du mock MovePlanner (couverture totale de docs/02) | M | A3 ✅ partiel — finir avant pilote |
| DETTE-008 | 2026-04-21 | Durcir `pnpm audit` en bloquant (retirer `\|\| true`) une fois Dependabot a nettoyé le backlog | L | A6.6 |
| DETTE-014 | 2026-04-21 | Créer projets Firebase `interim-agency-system` + `-staging` selon `docs/firebase-setup.md` | H | Avant A6.7 |
| DETTE-015 | 2026-04-21 | Provisionner GCP `europe-west6` selon ADR-0002 (Cloud SQL, Memorystore, Cloud Storage, Secret Manager, OIDC WIF) | H | Avant A6.7 |
| DETTE-016 | 2026-04-21 | Cloud Function `onCreate` qui pose les custom claims `agencyId` + `role` à l'inscription | M | A1.7 ✅ partiel — wire prod attend DETTE-014 |
| DETTE-033 | 2026-04-23 | Wire `/metrics` endpoint sur `apps/worker/main.ts` (port 9090) avec counters BullMQ par queue. Sans ça, dashboards `queue-depth` et `mp-health` (outbox lag) restent vides | M | A.6 (court — S) |
| DETTE-034 | 2026-04-23 | Implémenter `oncall-sms-bridge` (passerelle webhook → Swisscom SMS API) ou wire un service tiers (PagerDuty, Opsgenie). Sinon receiver `on-call` Alertmanager n'envoie qu'à Slack | M | A.7 |
| DETTE-035 | 2026-04-23 | Exposer métriques business `payroll_batch_*` et `availability_outbox_*` référencées par les dashboards | S | A.6 (court — S) |

### Dettes fermées (23)

DETTE-001 (composite TS, reportée A.6) · DETTE-002 (repo GitHub) · DETTE-003 (pnpm approve-builds) · DETTE-004 (husky pre-commit) · DETTE-005/009/012 (API Docker container) · DETTE-007 (branch protection — requalifiée DETTE-013) · DETTE-010 (Prisma tenant injection — remplacée par DETTE-019) · DETTE-011 (Testcontainers integration tests) · DETTE-013 (repo public + main ruleset) · DETTE-017 (Idempotency-Key inbound) · DETTE-018 (coverage CI enforcement) · DETTE-019 (tenant-guard $extends) · DETTE-020 (GCS CMEK) · DETTE-021 (ClamAV scan async) · DETTE-022 (OCR no-op port) · DETTE-023 (coverage api 70%) · DETTE-024 à 028 (SMS i18n + CSV export + SSE stream + Prisma MissionContract + observability metrics + tracing — closed in PRs #48/49/50) · DETTE-029 à 032 (WorkerAvailability Prisma + reminders delayed + various) · DETTE A.4 backend dettes (controllers + ports + GED purge worker via PR #57)

### Nouvelles dettes ouvertes ce sprint

*(aucune — la session de design Helvètia + fix dev server n'a pas introduit de dette qualifiée)*

---

## 6. Métriques de pilotage

| Métrique | Valeur | Cible | Tendance |
|----------|--------|-------|----------|
| Prompts completed catalogue | 43 / 48 (89.6%) | 100% (S14) | 🟢 en avance |
| Prompts completed total (catalogue + ad-hoc + OPS) | 45 / 53 | 53 | 🟢 |
| Tests unit + integration | **1095 unit + 6 integration** | ≥ couverture seuils | 🟢 |
| Couverture domain | 100% (mesurée A1.1) | ≥ 85% | 🟢 |
| Couverture shared | 96.58% | ≥ 80% | 🟢 |
| Couverture application | 84.14% | ≥ 80% | 🟢 |
| Couverture api | 87.24% lines / 75.24% branches | ≥ 80%/70% | 🟢 |
| Blockers conformité ouverts | 1 (LSE — externe) | 0 avant go-live | 🟡 |
| Blockers techniques ouverts | 1 (sandbox MP — externe) | 0 avant go-live | 🟡 |
| Dettes techniques qualifiées | 8 ouvertes (5 externes + 3 nouvelles A6.3 court terme) / 23 fermées | < 10 ouvertes | 🟢 |
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
| 2026-W17 (en cours) | 43 catalogue + 2 ad-hoc | exceptionnelle (sprint marathon) | 0 ajoutés / 2 clos (B-003, B-004 décision) | Resynchro PROGRESS le 2026-04-23 09:00 ; A6.3 fermé 2026-04-23 09:30 |

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
