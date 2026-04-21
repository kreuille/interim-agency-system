# Architecture cible

> **Version** : 1.0 — 2026-04-21
> **Statut** : cible MVP — peut évoluer par ADR (`docs/adr/`)

---

## 1. Vue 10'000 pieds

```
                                  ┌──────────────────────────────┐
                                  │        MOVEPLANNER           │
                                  │  (SaaS planification)        │
                                  └──────────────┬───────────────┘
                                                 │  API REST v1 + Webhooks
                                                 │  mTLS + Bearer + HMAC
                                                 ▼
 Intérimaires ─┐                       ┌──────────────────────┐
 (PWA mobile)  │                       │    SYSTÈME AGENCE    │
               ├────── magic link ────►│   (ce projet)        │
 Admin agence ─┤                       │                      │
 (Next.js web) │                       │  apps/api  (Node)    │
               │                       │  apps/web-admin      │
 Gestionnaire ─┘                       │  apps/web-portal     │
                                       │  apps/worker (cron)  │
                                       └──────────┬───────────┘
                                                  │
         ┌────────────────────────────────────────┼─────────────────────────────┐
         ▼                                        ▼                             ▼
  ┌─────────────────┐               ┌──────────────────────┐         ┌────────────────────┐
  │ PostgreSQL 16   │               │ Redis (BullMQ, cache)│         │ Cloud Storage CH   │
  │ (Infomaniak)    │               │                      │         │ (docs chiffrés)    │
  └─────────────────┘               └──────────────────────┘         └────────────────────┘
         │                                                                      │
         │              ┌────── Swisscom SMS ──────┐                             │
         │              │  Swisscom Trust Signing   │                            │
         │              │  PostFinance/UBS pain.001 │◄───── adapters externes ───┘
         │              │  Swissdec ELM             │
         │              │  Bexio/Abacus             │
         │              └───────────────────────────┘
         ▼
  Backup CH (daily)
```

---

## 2. Principes architecturaux

### 2.1 Architecture hexagonale (Ports & Adapters)

- **`packages/domain`** : code TypeScript pur, zéro dépendance externe. Entités, value objects, services domaine, invariants. C'est ici que réside la "loi métier".
- **`packages/application`** : use cases. Orchestration des entités et appels aux ports. Pas d'HTTP, pas de SQL.
- **`apps/api/src/infrastructure`** : adapters. Prisma, Express, BullMQ, clients HTTP, PDF, SMS, etc. Implémentent les interfaces définies dans le domaine.

Règle de dépendance : `infrastructure → application → domain`. Jamais l'inverse.

### 2.2 Multi-tenant par design

- `agencyId` dans chaque table, chaque JWT, chaque query.
- Middleware Prisma qui injecte automatiquement le `where: { agencyId }`.
- Tests d'isolation obligatoires : scénario "agence A ne peut pas lire les données de agence B".

### 2.3 Événementiel interne

- Un `EventBus` en mémoire (in-process) pour les effets de bord domaine (ex. `WorkerAvailabilityChanged` → déclenche push MP).
- BullMQ (Redis) pour les jobs asynchrones durables (push API, envois SMS, génération PDF, relances).
- Pattern **outbox** pour les actions critiques qui doivent survivre à un crash : écriture transactionnelle en base + job BullMQ qui dépile.

### 2.4 Idempotence partout

- Requêtes sortantes vers MP : `Idempotency-Key` UUID v4, persistance en `outbound_idempotency_keys`.
- Webhooks entrants de MP : dédupliqués par `X-MovePlanner-Event-Id` (table `inbound_webhook_events`).
- Jobs BullMQ : `jobId` stable, pas de doublons en queue.

---

## 3. Stack technique

| Couche | Choix | Justification |
|--------|-------|---------------|
| Langage | TypeScript 5.x strict | Typage fort, grand écosystème, familier |
| API | Node.js 20 + Express 4 | Maturité, volume de ressources, perf raisonnable |
| Validation | Zod | Single source of truth schéma runtime + types TS |
| ORM | Prisma 5 | DX, migrations déclaratives, type-safe |
| Base de données | PostgreSQL 16 | Fiabilité, JSONB, LTREE, extensions |
| Queue | BullMQ (Redis 7) | Jobs durables, retry, backoff, observabilité |
| Frontend admin | Next.js 14 App Router + Tailwind + shadcn/ui | SSR, DX, composants accessibles |
| Portail intérimaire | Next.js 14 PWA | Pas d'app native en MVP |
| Auth | Firebase Auth multi-tenant **ou** Supabase Auth | À trancher ADR-0004 ; Firebase pour aligner MP, Supabase pour full-Postgres |
| PDF | `pdf-lib` (contrats, factures) + `@react-pdf/renderer` (bulletins) | Contrôle fin vs DX |
| SMS | Swisscom Enterprise SMS | Opérateur CH, conformité nLPD |
| Signature | Swisscom Trust Signing Services (ZertES) | Recevabilité légale suisse |
| Paiements bancaires | pain.001 via PostFinance ou UBS API | Standard ISO 20022 CH |
| ELM | Swissdec adapter (Abacus/Bexio ou service tiers) | Annonce caisses sociales |
| Compta | Bexio + Abacus (API natives) | Couverture PME suisse |
| Hébergement | Infomaniak Public Cloud (défaut), Exoscale (backup) | Suisse, nLPD native |
| CI | GitHub Actions | Standard, gratuit pour privé limité |
| Observabilité | Sentry + Grafana Cloud + OpenTelemetry | Compromis coût/fonctionnalités |
| Secrets | Infomaniak Secret Manager ou HashiCorp Vault | Pas de secret en Git, jamais |

---

## 4. Modules backend (bounded contexts)

```
packages/domain/src/
  workers/           # TempWorker, WorkerDocument, Qualification, DrivingLicense
  clients/           # Client, ClientContract, RateCard
  availability/      # WorkerAvailability, AvailabilitySlot
  proposals/         # MissionProposal, ProposalStateMachine
  contracts/         # MissionContract, ContractTemplate
  timesheets/        # Timesheet, TimesheetAnomaly
  payroll/           # Payslip, PayrollEngine, CctRateCard, Deductions
  invoicing/         # Invoice, InvoiceLine, QrBillPayload, Dunning
  compliance/        # LseAuthorization, AuditLogEntry, NlpdRequest
  shared/            # Money, WeekIso, Canton, Ide, Avs, Iban value objects

apps/api/src/
  application/
    {module}/use-cases/*.ts
  infrastructure/
    persistence/prisma/
    http/controllers/
    queues/handlers/
    moveplanner/{client,webhook-handler,signature-verifier}.ts
    sms/swisscom-adapter.ts
    signature/zertes-adapter.ts
    pdf/{contract-renderer,payslip-renderer,invoice-renderer}.ts
    storage/gcs-adapter.ts
  shared/
    middleware/{auth,tenant,audit,rate-limit,idempotency}.ts
    events/event-bus.ts
    clock/clock-service.ts  # abstraction temps pour tests
```

---

## 5. Sécurité — vue transverse

- **Chiffrement au repos** : tous les documents intérimaires en GCS / Infomaniak Object Storage avec CMEK (Customer-Managed Encryption Keys) rotation 90j.
- **Chiffrement en transit** : TLS 1.3 obligatoire, HSTS, mTLS vers MP.
- **Secrets** : jamais dans le code, jamais dans `.env` committé. Secret manager de l'hébergeur.
- **Authentification** : Firebase/Supabase multi-tenant avec MFA pour rôles sensibles.
- **Autorisation** : RBAC à 5 rôles (`agency_admin`, `payroll_officer`, `dispatcher`, `sales`, `viewer`). Polices exprimées en TypeScript, testées unitairement.
- **Anti-abus** : rate limit par IP (express-rate-limit) + par user (Redis). 100 req/min/user par défaut.
- **Audit** : mutation de `TempWorker`, `WorkerDocument`, `MissionContract`, `Timesheet`, `Payslip`, `Invoice` → `audit_logs` append-only, 10 ans de conservation.
- **Logs applicatifs** : format JSON, pseudonymisation (`staffId` hashé) — jamais de nom complet en log.

---

## 6. Conformité — vue transverse

- **LSE** : table `lse_authorizations` avec numéros cantonal + fédéral, alerte 60j avant expiration.
- **CCT** : tables `cct_branches` et `cct_minimum_rates` mises à jour annuellement (cron + prompt `OPS.cct-yearly-update`).
- **LTr** : contraintes code (50h/sem, repos 11h, maj nuit 25%, dim 50%) exprimées dans le domaine `payroll/` et dans les règles d'anomalie `timesheets/`.
- **nLPD** : registre des traitements `docs/compliance/registre-traitements.md`, DPIA `docs/compliance/dpia-interimaires.md`, consentements horodatés en base.
- **Assurances sociales** : adapter Swissdec ELM pour annonces AVS/AI/AC/LAA/LPP. Barèmes cantonaux impôt à la source lus depuis un fichier officiel versionné.

---

## 7. Stratégie de tests

- Pyramide 70/20/10 (unit/intégration/E2E).
- Tests unit avec Vitest (domaine pur, adaptateurs mockés).
- Tests d'intégration avec Testcontainers (Postgres et Redis réels).
- Tests E2E avec Playwright (web-admin) et Supertest (API).
- **Tests de contrat** MovePlanner : fixtures d'événements capturés en sandbox, rejoués en CI.
- **Tests conformité** : scénarios dédiés (refus création contrat sous minimum CCT, blocage affectation > 50h/sem, export SECO complet, alerte permis B à J-60).
- Couverture : ≥ 85% domaine, ≥ 70% global — seuil échec de CI.

---

## 8. Déploiement

- **Environnements** : `local` (Docker Compose) → `staging` (Infomaniak) → `production` (Infomaniak séparé).
- **Pipeline** : GitHub Actions sur tag `release/vX.Y.Z` → build Docker multi-arch → push registry → deploy via Helm/Kustomize ou script `deploy.sh` (à trancher A0.4).
- **Migrations Prisma** : appliquées au boot via `prisma migrate deploy` en mode lock (un seul pod à la fois).
- **Rollback** : image Docker précédente redeployable en 1 commande. Migrations réversibles quand possible ; sinon, migrations forward-only avec *feature flags* pour basculer la feature.
- **Feature flags** : Unleash self-hosted ou Flipt. Flags pour activer paie, facturation, ELM indépendamment par tenant pendant le pilote.

---

## 9. Évolutions probables post-MVP (hors scope 11 semaines)

- Serveur **MCP MovePlanner** côté agence (permettre à un assistant IA interne d'interroger MP en langage naturel).
- Support **multi-canton** avancé (barèmes impôts à la source des 26 cantons).
- App native intérimaire (Flutter) si friction PWA observée.
- Marketplace intérimaires (acceptation de missions d'autres clients que MP).
- Dashboard analytique dédié avec Metabase ou Looker Studio.

---

**Fin de l'architecture cible v1.0**
