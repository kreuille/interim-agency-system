# PROMPTS.md — Catalogue maître des prompts

> Catalogue de référence pour l'orchestrateur. Chaque prompt est une **unité de travail atomique** exécutable par une session Claude dans un budget raisonnable (typiquement ≤ 2 jours-homme).
> La source de vérité de l'**état** est `prompts/orchestrator/PROGRESS.md`. Ce catalogue définit le **plan**.

---

## Lecture de la table

- **ID** : identifiant unique (sprint.N). Jamais réutilisé, jamais renuméroté.
- **Titre** : résumé actionnable.
- **Effort** : S (≤ 0.5 j), M (1 j), L (2 j), XL (> 2 j — à éviter, à scinder).
- **BlockedBy** : IDs qui doivent être `completed` avant.
- **Skills** : chemins des skills à charger en en-tête de prompt.
- **Focus** : mot-clé du périmètre.

---

## Sprint A.0 — Setup (1 semaine)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| A0.1 | Init monorepo pnpm + TS strict + structure hexagonale | M | — | `skills/dev/backend-node`, `skills/ops/project-kickoff` | Foundation |
| A0.2 | Docker Compose local (Postgres, Redis, MailHog, mock MP) | S | A0.1 | `skills/dev/devops-swiss` | DX |
| A0.3 | CI GitHub Actions (lint, typecheck, tests, build, Trivy) | M | A0.1 | `skills/dev/devops-swiss`, `skills/dev/testing-strategy` | CI |
| A0.4 | Provisioning hébergement Suisse (Infomaniak/Exoscale) | L | — | `skills/dev/devops-swiss`, `skills/compliance/nlpd-privacy` | Infra |
| A0.5 | Schéma Prisma v0 (entités §4.1 brief) | M | A0.1 | `skills/dev/database-postgres` | Data |
| A0.6 | Auth Firebase/Supabase multi-tenant + MFA | M | A0.1 | `skills/dev/security-hardening` | Sécu |

---

## Sprint A.1 — Core métier (2 semaines)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| A1.1 | Entité TempWorker + CRUD + validations CH (AVS/IBAN) | L | A0.5 | `skills/dev/backend-node`, `skills/compliance/work-permits`, `skills/business/hr-interim` | Workers |
| A1.2 | Upload documents (permis, AVS, LAMal, diplômes) chiffré CMEK | L | A1.1 | `skills/dev/security-hardening`, `skills/compliance/nlpd-privacy` | Documents |
| A1.3 | Alertes d'expiration (cron + webhooks sortants) | M | A1.2 | `skills/dev/backend-node` | Alerting |
| A1.4 | Entité Client + CRUD | M | A0.5 | `skills/dev/backend-node`, `skills/business/agency-sales` | Clients |
| A1.5 | ClientContract + RateCard (refus sous minimum CCT) | M | A1.4 | `skills/compliance/cct-staffing` | Tarifs |
| A1.6 | Audit log infrastructure (append-only, 10 ans) | M | A0.5 | `skills/compliance/nlpd-privacy`, `skills/dev/database-postgres` | Conformité |
| A1.7 | Admin UI core Next.js (tables + forms + upload) | L | A1.1, A1.4 | `skills/dev/frontend-next` | UI |

---

## Sprint A.2 — Disponibilités & push MovePlanner (2 semaines)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| A2.1 | Entité WorkerAvailability (slots + TTL + freshness) | M | A1.1 | `skills/dev/backend-node` | Data |
| A2.2 | UI calendrier hebdo admin | L | A2.1, A1.7 | `skills/dev/frontend-next` | UI |
| A2.3 | Portail PWA intérimaire (saisie dispos, magic link) | L | A2.1 | `skills/dev/frontend-next`, `skills/dev/security-hardening` | UX |
| A2.4 | Client API MovePlanner typé (mTLS + key rotation 90j) | L | A0.6 | `skills/integration/moveplanner-api`, `skills/dev/security-hardening` | Intégration |
| A2.5 | Queue BullMQ `availability-sync` + idempotency + outbox | M | A2.1, A2.4 | `skills/integration/moveplanner-api`, `skills/dev/backend-node` | Reliability |
| A2.6 | Circuit breaker opossum + alerting Sentry | S | A2.4 | `skills/dev/devops-swiss` | Observability |

---

## Sprint A.3 — Webhooks entrants & propositions (2 semaines)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| A3.1 | Endpoint `/webhooks/moveplanner` avec HMAC + tolérance ±5min | M | A0.6 | `skills/integration/moveplanner-webhooks`, `skills/dev/security-hardening` | Sécu |
| A3.2 | Persistence inbound_webhook_events + dispatcher BullMQ | M | A3.1 | `skills/integration/moveplanner-webhooks` | Reliability |
| A3.3 | Entité MissionProposal + machine à états | M | A1.1 | `skills/dev/backend-node` | Data |
| A3.4 | Routage pass-through vs contrôle agence | L | A3.3 | `skills/business/agency-management` | Workflow |
| A3.5 | Adapter Swisscom Enterprise SMS | M | — | `skills/integration/swisscom-sms` | Notif |
| A3.6 | Dashboard live propositions (SSE) | L | A3.3, A1.7 | `skills/dev/frontend-next` | UI |

---

## Sprint A.4 — Contrats & timesheets (2 semaines)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| A4.1 | Entité MissionContract générée à acceptation | M | A3.3 | `skills/business/agency-management`, `skills/compliance/cct-staffing` | Légal |
| A4.2 | Génération PDF contrat par branche CCT (Handlebars + pdf-lib) | L | A4.1 | `skills/compliance/cct-staffing` | Document |
| A4.3 | Signature électronique ZertES (Swisscom Trust Signing) | L | A4.2 | `skills/integration/signature-electronique` | Légal |
| A4.4 | Archivage GED chiffré 10 ans | M | A4.3 | `skills/compliance/nlpd-privacy` | Conformité |
| A4.5 | Réception webhook `timesheet.ready_for_signature` | M | A3.2 | `skills/integration/moveplanner-webhooks` | Intégration |
| A4.6 | UI contrôle timesheet (comparaison + anomalies LTr) | L | A4.5 | `skills/dev/frontend-next`, `skills/compliance/ltr-working-time` | UI |
| A4.7 | API sign/dispute timesheet vers MovePlanner | M | A4.5, A2.4 | `skills/integration/moveplanner-api` | Intégration |

---

## Sprint A.5 — Paie & facturation (2-3 semaines)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| A5.1 | Moteur de paie CCT (heures × taux, modèle domaine pur) | XL | A4.7 | `skills/business/payroll-weekly`, `skills/compliance/cct-staffing` | Paie |
| A5.2 | Majorations nuit/dimanche/supp + jours fériés cantonaux | M | A5.1 | `skills/compliance/ltr-working-time`, `skills/business/payroll-weekly` | Paie |
| A5.3 | Retenues AVS/AC/LAA/LPP + impôt à la source cantonal | L | A5.1 | `skills/compliance/social-insurance`, `skills/business/payroll-weekly` | Paie |
| A5.4 | Bulletin de salaire PDF standard CH | M | A5.1 | `skills/business/payroll-weekly` | Document |
| A5.5 | Adapter ELM Swissdec (annonce caisses sociales) | L | A5.3 | `skills/compliance/social-insurance` | Intégration |
| A5.6 | Export ISO 20022 pain.001 (PostFinance / UBS) | M | A5.3 | `skills/integration/iso20022-payments` | Paiement |
| A5.7 | Générateur de facture QR-bill Swiss Payment Standards | L | A4.7 | `skills/business/qr-bill-invoicing` | Facturation |
| A5.8 | Pipeline de relances automatiques (J+7, J+15, J+30) | M | A5.7 | `skills/business/agency-management` | Cash |
| A5.9 | Export compta Bexio + Abacus (API natives) | L | A5.7 | `skills/business/accounting-swiss` | Compta |

---

## Sprint A.6 — Conformité & go-live (1-2 semaines)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| A6.1 | Dashboard conformité (LSE + CCT + docs + missions actives) | M | A5.* | `skills/compliance/lse-authorization`, `skills/compliance/cct-staffing` | Conformité |
| A6.2 | Export contrôle SECO 1 clic (PDF + CSV) | M | A6.1 | `skills/compliance/lse-authorization` | Conformité |
| A6.3 | Stack observabilité (Sentry, Grafana, OpenTelemetry) | L | — | `skills/dev/devops-swiss`, `skills/ops/release-management` | Ops |
| A6.4 | Runbooks incidents (MP injoignable, webhook storm, fuite) | M | A6.3 | `skills/ops/release-management` | Ops |
| A6.5 | Backup Postgres + test de restauration prouvé | M | A0.4 | `skills/dev/devops-swiss` | Continuité |
| A6.6 | Pentest externe (prestataire CH) | L | A6.1..A6.5 | `skills/dev/security-hardening` | Sécu |
| A6.7 | Go-live pilote (MP prod + 1 client + 1-3 intérimaires) | M | all | `skills/ops/release-management`, `skills/business/agency-management` | Lancement |

---

## Prompts transversaux (exécutables à tout moment)

| ID | Titre | Effort | Cadence | Skills |
|----|-------|--------|---------|--------|
| OPS.weekly-review | Revue hebdo de l'orchestrateur (vendredi 17h) | S | hebdo | `skills/ops/release-management` |
| OPS.cct-yearly-update | MAJ barèmes CCT (parution annuelle swissstaffing) | M | annuel | `skills/compliance/cct-staffing` |
| OPS.api-key-rotation | Rotation clé API MovePlanner (90 jours) | S | 90j | `skills/integration/moveplanner-api` |
| OPS.permit-expiry-scan | Scan mensuel des permis B/L/G/C arrivant à terme | S | mensuel | `skills/compliance/work-permits` |
| OPS.dpia-refresh | Mise à jour DPIA nLPD (changement traitement) | M | à la demande | `skills/compliance/nlpd-privacy` |

---

## Catégorie AH — Prompts ad-hoc

Format : `AH.{NNN}-{slug}` — créer dans `prompts/adhoc/` au moment du besoin et référencer dans `PROGRESS.md` section dédiée.

---

## Règles de mise à jour du catalogue

1. **Ajouter un prompt** : PR avec label `catalog-update`, mise à jour de cette table + création du fichier prompt détaillé dans `prompts/sprint-.../`.
2. **Modifier un prompt existant** : ne **jamais** réutiliser un ID terminé. Créer un `AH.NNN-followup-de-{ID}` si la portée a changé.
3. **Abandonner un prompt** : le marquer abandoned dans `PROGRESS.md` avec motif, ne pas supprimer du catalogue (traçabilité).

---

**Fin du catalogue v1.0** — 48 prompts planifiés, ~11 semaines de build.
