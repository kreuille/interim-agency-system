# Skills — Compétences mobilisables par les sessions Claude

> Chaque `SKILL.md` encapsule la **connaissance d'un rôle** ou d'un **domaine d'expertise** nécessaire au projet.
> Une session Claude charge une ou plusieurs skills au démarrage d'un prompt, selon l'en-tête du prompt.

---

## Comment lire une skill

Chaque `SKILL.md` suit le même gabarit :

1. **Rôle** — qui porte cette compétence dans une vraie équipe
2. **Quand l'utiliser** — signaux d'activation
3. **Concepts clés** — vocabulaire et mental models
4. **Règles dures** — non négociables
5. **Pratiques et checklists** — gestes concrets
6. **Pièges courants** — anti-patterns à éviter
7. **Références** — liens vers docs, lois, normes

---

## Catalogue

### Dev (`skills/dev/`)

| Skill | Rôle équivalent | Résumé |
|-------|-----------------|--------|
| `backend-node/SKILL.md` | Dev backend TS senior | Node.js 20, Express, hexagonal, Zod, erreurs typées |
| `frontend-next/SKILL.md` | Dev frontend senior | Next.js 14 App Router, Tailwind, shadcn/ui, a11y |
| `database-postgres/SKILL.md` | DBA / backend | PostgreSQL 16, Prisma, indexing, migrations, multi-tenant |
| `devops-swiss/SKILL.md` | DevOps / SRE | Docker, CI GH Actions, Infomaniak, observabilité |
| `testing-strategy/SKILL.md` | QA / tech lead | Pyramide, Testcontainers, Playwright, contrats Pact |
| `security-hardening/SKILL.md` | Sécurité applicative | OWASP, mTLS, HMAC, CSP, auth MFA |
| `api-rest-design/SKILL.md` | API designer | REST, OpenAPI, versioning, idempotence |
| `webhooks-hmac/SKILL.md` | Intégration | Signatures HMAC, rejeu, outbox pattern |
| `observability/SKILL.md` | SRE | Sentry, OTel, Grafana, alerting |

### Conformité CH (`skills/compliance/`)

| Skill | Rôle équivalent | Résumé |
|-------|-----------------|--------|
| `lse-authorization/SKILL.md` | Juriste / DPO | LSE, OSE, autorisation cantonale/fédérale |
| `cct-staffing/SKILL.md` | Juriste social | CCT Location de services, minimaux branche |
| `nlpd-privacy/SKILL.md` | DPO | nLPD, registre des traitements, DPIA |
| `ltr-working-time/SKILL.md` | Juriste social | LTr, 50h/sem, repos 11h, majorations |
| `social-insurance/SKILL.md` | Gestionnaire paie | AVS/AI/APG, AC, LAA, LPP, impôt source |
| `work-permits/SKILL.md` | RH / juriste | Permis L, B, C, G, validation et alertes |
| `suva-workplace-safety/SKILL.md` | Resp. sécurité | SUVA, LAA, SST, EPI, déclaration accidents |

### Business agence (`skills/business/`)

| Skill | Rôle équivalent | Résumé |
|-------|-----------------|--------|
| `agency-management/SKILL.md` | Direction d'agence | Pilotage KPI, ops, relations clients |
| `agency-sales/SKILL.md` | Commercial / BizDev | Prospection, grilles, négo, cycle vente |
| `agency-direction-strategy/SKILL.md` | Direction générale | Vision, stratégie multi-client, marge |
| `hr-interim/SKILL.md` | RH d'agence | Sourcing, entretiens, fidélisation |
| `payroll-weekly/SKILL.md` | Gestionnaire paie | Paie hebdo CCT, majorations, 13e |
| `qr-bill-invoicing/SKILL.md` | Facturation | QR-bill, Swiss Payment Standards |
| `accounting-swiss/SKILL.md` | Comptable | Plan PME, TVA 8.1%, Bexio/Abacus |

### Intégrations (`skills/integration/`)

| Skill | Rôle équivalent | Résumé |
|-------|-----------------|--------|
| `moveplanner-api/SKILL.md` | Intégrateur API | Client REST MP, mTLS, rotation clé |
| `moveplanner-webhooks/SKILL.md` | Intégrateur événements | HMAC, idempotence, dispatcher |
| `swisscom-sms/SKILL.md` | Intégrateur SMS | Swisscom Enterprise SMS, Twilio fallback |
| `signature-electronique/SKILL.md` | Intégrateur légal | ZertES, Swisscom Trust Signing |
| `iso20022-payments/SKILL.md` | Intégrateur banque | pain.001, camt.053, rapprochement |

### Ops (`skills/ops/`)

| Skill | Rôle équivalent | Résumé |
|-------|-----------------|--------|
| `project-kickoff/SKILL.md` | Chef de projet | Scrum-like, DoD, cadencement |
| `sprint-planning/SKILL.md` | PO / SM | Planning, rétro, démo |
| `code-review/SKILL.md` | Tech lead | Revue, checklist, ton constructif |
| `release-management/SKILL.md` | Release manager | Versioning, rollback, runbooks |

---

## Règles d'utilisation

- Une session Claude charge **toutes les skills listées dans l'en-tête du prompt**, pas plus, pas moins.
- Une skill doit tenir en **une fenêtre de contexte raisonnable** (~ 2–4 pages Markdown). Si elle enfle, la scinder.
- Les skills sont **versionnées avec le code** : elles évoluent par PR, pas par diktat.
- Quand une skill change, les prompts qui la référencent sont **réévalués** lors du weekly review.

---

## Ajouter une skill

1. Créer `skills/{catégorie}/{nom-kebab}/SKILL.md` en suivant le gabarit.
2. Référencer dans ce README.
3. Si utilisée par des prompts existants, mettre à jour les en-têtes correspondants.
4. PR avec label `skills-update`, revue par lead tech + PO.
