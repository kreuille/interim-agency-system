# Rôles et responsabilités

> **Version** : 1.0 — 2026-04-21
> **Raison d'être** : savoir qui décide quoi, qui exécute quoi, qui valide quoi.

---

## 1. Rôles humains du projet

### Fondateur / Direction
- **Responsabilités** : vision, stratégie, arbitrages budget, relations clients clés, caution LSE.
- **Décide** : roadmap annuelle, hires seniors, contrats clients majeurs, pivots stratégiques.
- **Valide** : changement de stack majeur, budget > 50 kCHF, partenariat commercial.
- **Skill de référence** : `skills/business/agency-direction-strategy/SKILL.md`.

### Lead tech / CTO
- **Responsabilités** : architecture, qualité code, recrutement technique, arbitrages techniques.
- **Décide** : choix de librairies, patterns d'architecture, outils CI/CD, runbooks.
- **Valide** : toute PR avec label `compliance-review`, toute modification `CLAUDE.md`, toute ADR.
- **Skill de référence** : `skills/dev/backend-node/SKILL.md`, `skills/ops/code-review/SKILL.md`.

### PO / Chef de projet
- **Responsabilités** : priorités, backlog, cadencement, reporting fondateur, relation équipe.
- **Décide** : ordre des prompts, périmètre sprint.
- **Valide** : démo sprint, mise à jour `PROGRESS.md` weekly.
- **Skill de référence** : `skills/ops/sprint-planning/SKILL.md`.

### Dev full-stack (x2)
- **Responsabilités** : implémentation prompts, tests, revue de code entre eux.
- **Décide** : détails d'implémentation dans le cadre du prompt.
- **Valide** : PR d'un autre dev.
- **Skill de référence** : `skills/dev/*`.

### Juriste / DPO (temps partiel)
- **Responsabilités** : conformité LSE, CCT, nLPD, LTr. Revue des contrats clients, contrats intérimaires, registre traitements.
- **Décide** : interprétations légales, mises à jour conformité.
- **Valide** : toute PR avec label `compliance-review`.
- **Skill de référence** : `skills/compliance/*`.

### Gestionnaire d'agence (post-MVP)
- **Responsabilités** : ops quotidiennes, relation intérimaires, traitement propositions en mode contrôle, disputes.
- **Skill de référence** : `skills/business/agency-management/SKILL.md`.

### Gestionnaire paie (post-MVP ou externalisé)
- **Responsabilités** : contrôle paie hebdo, ELM, déclarations caisses, IS.
- **Skill de référence** : `skills/business/payroll-weekly/SKILL.md`, `skills/compliance/social-insurance/SKILL.md`.

### Commercial / BizDev (post-MVP)
- **Responsabilités** : prospection, contrats cadres, renouvellement, upsell.
- **Skill de référence** : `skills/business/agency-sales/SKILL.md`.

---

## 2. Rôles applicatifs (RBAC dans le SI)

| Rôle applicatif | Périmètre | MFA | Exemples d'accès |
|-----------------|-----------|-----|-------------------|
| `agency_admin` | Plein pouvoir tenant | ✅ obligatoire | Config, utilisateurs, contrats, grilles |
| `payroll_officer` | Paie + compta | ✅ obligatoire | Bulletins, exports compta, ELM |
| `dispatcher` | Propositions, missions, disputes | Recommandé | Dashboard propositions, contrats, timesheets |
| `sales` | Clients, tarification, pipeline | Recommandé | CRM, grilles, offres |
| `hr` | Intérimaires, documents, onboarding | Recommandé | CRUD worker, docs, qualifs |
| `viewer` | Lecture seule | — | Rapports, dashboards |
| `auditor` (externe ponctuel) | Lecture large + audit log | ✅ obligatoire | Pour contrôle SECO / révision comptable |

**Principe** : un user peut cumuler des rôles. En onboarding agence, le fondateur a `agency_admin`. Les rôles fins sont attribués à mesure de l'arrivée des collaborateurs.

---

## 3. RACI — cycle projet

| Activité | Fondateur | Lead tech | PO | Dev 1/2 | Juriste |
|----------|-----------|-----------|----|---------|---------|
| Vision / stratégie | R,A | C | C | I | I |
| Architecture | C | R,A | I | C | — |
| Choix stack | C | R,A | I | C | — |
| Exécution prompts | I | C | C | R | I |
| Revue code | — | R,A | I | R (peer) | — |
| Conformité LSE/CCT | A | C | C | C | R |
| Conformité nLPD | A | C | C | C | R,A |
| Onboarding client | A | I | R | I | C |
| Dépôt LSE | A,R | — | I | — | C |
| Contrat commercial | A | I | C | — | C,R |
| Gestion incident P1 | A | R | C | R | I |
| Postmortem | I | R,A | C | C | — |
| Revue weekly orchestrateur | I | C | R,A | I | — |

R = Responsible (fait), A = Accountable (responsable final), C = Consulted, I = Informed.

---

## 4. Tableau contacts (à remplir)

| Rôle | Nom | Email | Tél | Backup |
|------|-----|-------|-----|--------|
| Fondateur | *à compléter* | *@* | *+41* | — |
| Lead tech | *à compléter* | *@* | *+41* | Dev 1 |
| PO | *à compléter* | *@* | *+41* | Fondateur |
| Dev 1 | *à compléter* | *@* | *+41* | Dev 2 |
| Dev 2 | *à compléter* | *@* | *+41* | Dev 1 |
| Juriste / DPO | *à compléter* | *@* | *+41* | — |
| Contact MovePlanner | *à compléter* | *@* | *+41* | — |
| Comptable externe | *à compléter* | *@* | *+41* | — |
| Assurance LAA (SUVA) | *à compléter* | *@* | *+41* | — |
| Caisse LPP | *à compléter* | *@* | *+41* | — |
| Banque (PostFinance/UBS) | *à compléter* | *@* | *+41* | — |
| Hébergeur (Infomaniak) | support 24/7 | support@ | *+41* | — |

---

**Fin du document rôles v1.0** — à mettre à jour à chaque arrivée/départ d'équipier.
