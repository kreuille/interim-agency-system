# Helvètia Intérim — SI / SaaS pour agences d'intérim suisses

> 🇨🇭 **Helvètia Intérim** — Le SI natif suisse pour agences de travail temporaire.
> **Phase 1** (actuelle) : pilote opérationnel avec l'agence du fondateur.
> **Phase 2** (post-pilote) : pivot SaaS multi-agences — voir [ADR-0006](docs/adr/0006-saas-pivot.md) + [brief phase 2](docs/01b-brief-saas-pivot.md).
> **Marque** : Helvètia Intérim. **Domaine** : https://helvetia-interim.guedou.ch
> **Kit presse** : [`docs/branding/`](docs/branding/)

Système d'information pour **agences suisses de travail temporaire**, nativement conforme au droit suisse (LSE, CCT Location de services, LTr, nLPD) et intégré par API aux plateformes de planification clients (MovePlanner d'abord). Multi-tenant par design dès A0.5.

> **Statut pilote** : go-live prévu 2026-Q2 (44/48 prompts catalogue mergés ; reste A0.4/A5.5/A6.6/A6.7 = actions externes).
> **Statut SaaS** : Sprint B amorcé (B0.4 mergé — règles éditeur SaaS posées ; B0.1 branding en cours).
> **Date** : 2026-04-25

---

## Pour qui

- **Fondateur / direction** : lisez `docs/03-plan-de-dev.md` et `prompts/orchestrator/PROGRESS.md`
- **Lead tech / CTO** : `CLAUDE.md` puis `docs/05-architecture.md`
- **Développeur qui rejoint le projet** : `CLAUDE.md` → `prompts/orchestrator/ORCHESTRATOR.md` → `prompts/PROMPTS.md`
- **Juriste / DPO** : `docs/06-risques.md` + `docs/compliance/` (à venir)
- **Session Claude Code** : `CLAUDE.md` (en premier, toujours) puis le protocole `ORCHESTRATOR.md`

---

## Structure du repo

```
.
├── CLAUDE.md                     # Règles d'ingénierie — à lire en premier
├── README.md                     # Ce fichier
├── docs/
│   ├── 01-brief.md               # Brief métier (source)
│   ├── 02-partners-specification.md   # Contrat d'interface MovePlanner
│   ├── 03-plan-de-dev.md         # Plan de développement 7 sprints
│   ├── 05-architecture.md        # Architecture cible (à venir)
│   ├── adr/                      # Architecture Decision Records
│   └── compliance/               # Registre nLPD, DPIA, etc.
├── skills/
│   ├── dev/                      # Skills dev (backend, frontend, DB, devops, sécu, tests)
│   ├── compliance/               # Skills conformité CH (LSE, CCT, nLPD, LTr, assurances)
│   ├── business/                 # Skills métier agence (HR, paie, QR-bill, compta, sales)
│   ├── integration/              # Skills intégrations (MP API, webhooks, SMS, signature, ISO 20022)
│   └── ops/                      # Skills ops (kickoff, sprint, release, runbooks)
├── prompts/
│   ├── PROMPTS.md                # Catalogue maître des prompts
│   ├── orchestrator/
│   │   ├── ORCHESTRATOR.md       # Protocole d'orchestration
│   │   ├── PROGRESS.md           # État d'avancement (vérité)
│   │   ├── SESSION-LOG.md        # Journal des sessions
│   │   └── RESUME-TEMPLATE.md    # Gabarit de reprise
│   ├── sprint-a0-setup/          # Prompts A.0
│   ├── sprint-a1-core/           # Prompts A.1
│   ├── sprint-a2-availability/   # Prompts A.2
│   ├── sprint-a3-webhooks/       # Prompts A.3
│   ├── sprint-a4-contracts-timesheets/
│   ├── sprint-a5-payroll-invoicing/
│   └── sprint-a6-compliance-golive/
└── (apps/ packages/)             # Code — créé lors du prompt A0.1
```

---

## Vision 60 secondes

Vous êtes fondateur d'une agence suisse de travail temporaire. Votre premier gros client s'appelle MovePlanner, un SaaS de planification intelligente pour entreprises de déménagement. MovePlanner a besoin de pouvoir proposer vos intérimaires à ses clients **en temps réel**, sans ressaisie manuelle.

Ce projet construit le système d'information de l'agence : gestion des intérimaires, disponibilités synchronisées par API avec MovePlanner, réception des propositions de mission, contrats de mission signés électroniquement (ZertES), relevés d'heures, paie hebdomadaire (CCT + AVS/LAA/LPP + ELM), facturation QR-bill. Le tout hébergé en Suisse, conforme à la nLPD, et pensé pour scaler vers d'autres clients que MovePlanner.

Le différenciateur concurrentiel : là où Pixid, Armado, PeoplePlanner sont pensés pour la France, **celui-ci est suisse de bout en bout** et intègre l'API de planification du client par design.

---

## Démarrage rapide

### Si vous êtes un humain qui découvre le projet

1. Lisez `docs/03-plan-de-dev.md` — 20 minutes — vous aurez la vision complète.
2. Lisez `prompts/orchestrator/PROGRESS.md` — 5 minutes — vous saurez où on en est.
3. Retournez voir le fondateur avec vos questions.

### Si vous êtes Claude (session Cowork ou Claude Code)

1. Appliquez le protocole `prompts/orchestrator/ORCHESTRATOR.md` §3 à la lettre.
2. Pas de raccourci. Pas de code avant la lecture. Pas de clôture sans mise à jour de `PROGRESS.md`.

### Si vous voulez coder

Voir [`docs/dev-setup.md`](docs/dev-setup.md) pour le démarrage complet en < 2 min (clone → `make up` → `pnpm dev`).

TL;DR :

```bash
pnpm install
cp .env.example .env
make up       # Postgres + Redis + MailHog + mock MovePlanner
make smoke    # smoke-test
pnpm dev
```

### Si vous voulez lancer un nouveau prompt

Lancez une session Claude Code avec comme premier prompt : **"Lis `CLAUDE.md`, `docs/03-plan-de-dev.md`, `prompts/orchestrator/ORCHESTRATOR.md`, `prompts/orchestrator/PROGRESS.md`, puis exécute le prompt désigné dans `PROGRESS.md §0 Prochain prompt`"**.

---

## Contacts

Voir `prompts/orchestrator/PROGRESS.md §7`.

---

## Licence

À définir. Par défaut propriétaire. Si code OSS un jour, revoir les dépendances légales.

---

**Pour toute question : commencer par lire `CLAUDE.md`. La réponse y est probablement.**
