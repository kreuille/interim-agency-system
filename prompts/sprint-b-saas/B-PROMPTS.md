# B-PROMPTS.md — Catalogue Sprint B (SaaS Helvètia Intérim)

> Catalogue de référence des 25 prompts Sprint B. Plan, pas état.
> État réel : `prompts/orchestrator/PROGRESS.md`.

---

## Sprint B.0 — Fondations SaaS (3-4 j, parallélisable pendant pilote)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| B0.1 | Nom + domaine + branding produit + ADR-0006 | M | — | `skills/ops/project-kickoff`, `skills/business/agency-direction-strategy` | Branding |
| B0.2 | Landing page publique statique (Next.js ou Framer) | L | B0.1 | `skills/dev/frontend-next` | Marketing |
| B0.3 | Compte Stripe CH + plans (Starter/Pro/Enterprise) + ADR-0007 | M | B0.1 | `skills/business/accounting-swiss` | Billing |
| B0.4 | Amendements CLAUDE.md pour contexte éditeur SaaS | S | B0.1 | `skills/ops/code-review` | Règles |
| B0.5 | CGU + politique confidentialité + DPA template client + ADR juridique | L | B0.1 | `skills/compliance/nlpd-privacy`, `skills/compliance/lse-authorization` | Légal |

## Sprint B.1 — Onboarding self-service (6-8 j)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| B1.1 | Signup flow (email + magic link + tenant Firebase auto-créé) | L | B0.1, B0.4 | `skills/dev/security-hardening`, `skills/dev/frontend-next` | Auth |
| B1.2 | Wizard onboarding 7 étapes (entité, LSE, DPA, Stripe, branding, team) | XL | B1.1, B0.3, B0.5 | `skills/compliance/lse-authorization`, `skills/dev/frontend-next` | UX |
| B1.3 | Tenant provisioning backend (schéma Prisma `tenants` étendu, buckets dédiés, secrets isolés) | L | B1.1 | `skills/dev/database-postgres`, `skills/dev/security-hardening` | Infra |
| B1.4 | Emails transactionnels (Postmark EU ou Resend EU, templates FR+DE) | M | B1.1 | `skills/integration/swisscom-sms` (pattern adapté) | Notif |
| B1.5 | Admin Users UI (Paramètres → Utilisateurs → Inviter/Rôle/Désactiver) | M | B1.3 | `skills/dev/frontend-next` | UX admin |

## Sprint B.2 — Durcissement multi-tenant (4-5 j)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| B2.1 | Stripe webhooks → activation/suspension tenant + trial 14 jours | M | B0.3, B1.3 | `skills/dev/webhooks-hmac`, `skills/dev/backend-node` | Billing |
| B2.2 | Tests E2E cross-tenant exhaustifs (50+ scénarios de fuite potentielle) | L | B1.3 | `skills/dev/testing-strategy`, `skills/dev/security-hardening` | Sécu |
| B2.3 | Audit log staff éditeur (qui a consulté quoi chez quel tenant) | M | B1.3 | `skills/compliance/nlpd-privacy` | Conformité |
| B2.4 | Enforcement LSE par tenant (refus activation si LSE absente/expirée) | M | B1.2 | `skills/compliance/lse-authorization` | Conformité |
| B2.5 | DPA auto-généré + signature électronique ZertES à l'onboarding | L | B1.2 | `skills/integration/signature-electronique`, `skills/compliance/nlpd-privacy` | Légal |

## Sprint B.3 — White-label et multi-cible (5-6 j)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| B3.1 | White-label theming (logo tenant, couleurs, custom domain `app.{tenantSlug}.helvetia-interim.guedou.ch`) | L | B1.3 | `skills/dev/frontend-next`, `skills/dev/devops-swiss` | Branding |
| B3.2 | Pack PME simplifié (flow allégé pour opérateurs non-agences) | M | B1.2 | `skills/business/agency-management` | Produit |
| B3.3 | Portail partenaire MovePlanner (API revendeurs + dashboard de leurs agences) | L | B1.3 | `skills/integration/moveplanner-api` | Partenariat |

## Sprint B.4 — Support, docs, growth (5-6 j)

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| B4.1 | Portail support ticket (Plain EU ou Crisp EU, DPA CH-compatible) | M | B1.3 | `skills/ops/release-management` | Support |
| B4.2 | Docs publiques `docs.helvetia-interim.guedou.ch` (Mintlify ou GitBook) | M | B0.1 | `skills/ops/project-kickoff` | Docs |
| B4.3 | Churn management (trial expiring, downgrade flow, cancellation + data export) | M | B2.1 | `skills/compliance/nlpd-privacy` | Produit |
| B4.4 | Dashboard interne metrics SaaS (MRR/ARR, churn, LTV, CAC, NPS) | M | B2.1 | `skills/dev/observability`, `skills/business/agency-direction-strategy` | Analytics |
| B4.5 | Marketing ops (Mailchimp/Brevo EU, LinkedIn templates, blog SEO) | M | B0.2 | `skills/business/agency-sales` | Growth |

## Sprint B.5 — Tests profonds avant bascule commerciale (4-5 j)

Le fondateur a explicitement demandé "tester profondément". Ce sprint existe pour ça.

| ID | Titre | Effort | BlockedBy | Skills | Focus |
|----|-------|--------|-----------|--------|-------|
| B5.1 | Red team SaaS (scénarios de fraude tenant, abus trial, data exfiltration) | L | B2.* | `skills/dev/security-hardening`, `skills/dev/testing-strategy` | Sécu |
| B5.2 | Load testing multi-tenant (100 tenants × 50 workers chacun, 1h soutenu) | M | B1.3 | `skills/dev/devops-swiss` | Perf |
| B5.3 | DR multi-tenant (panne d'un tenant n'impacte pas les autres + restore sélectif) | M | B2.* | `skills/dev/devops-swiss` | Continuité |
| B5.4 | User testing 5-8 sessions fondateurs d'agences (staging 3 tenants démo) | M | B1.2, B3.1 | `skills/business/agency-direction-strategy` | UX |
| B5.5 | Pentest externe dédié SaaS (complément A6.6) | L | B2.*, B3.* | `skills/dev/security-hardening` | Sécu externe |
| B5.6 | Audit conformité nLPD éditeur SaaS (cabinet CH spécialisé) | L | B2.3, B0.5 | `skills/compliance/nlpd-privacy` | Conformité externe |

## Prompts OPS SaaS (récurrents, à ajouter aux OPS transversaux existants)

| ID | Cadence | Effort | Description |
|----|---------|--------|-------------|
| OPS.saas-churn-review | Mensuel | S | Revue des tenants à risque de churn (usage < seuil, tickets > N, trial expire) |
| OPS.saas-billing-reconcile | Mensuel | S | Rapprochement Stripe MRR vs facturation interne, anomalies |
| OPS.saas-security-staff-audit | Trimestriel | M | Audit accès staff éditeur aux données tenants, rotation credentials staff |
| OPS.saas-tenant-health | Hebdo | S | Top-N tenants par utilisation, tenants bloqués sur quelque chose, opportunités upsell |

## Règles de mise à jour

Mêmes règles que `prompts/PROMPTS.md` : ajout par PR `catalog-update`, jamais réutiliser un ID, abandon marqué abandoned avec motif.

## Ordre d'exécution recommandé

**Pendant le pilote (parallélisable)** : B0.1, B0.2, B0.4, B0.5, B4.2 (docs).

**Juste après go-live pilote validé (J+30 à J+60)** : B0.3, B1.*, B2.*, B5.4 (user testing sur agences amies).

**Phase ramp-up (M+2 à M+4)** : B3.*, B4.*, B5.1, B5.2, B5.3, B5.5, B5.6.

**Lancement commercial** : dès B5.* verts et filialisation effective.
