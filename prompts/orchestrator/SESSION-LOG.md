# SESSION-LOG.md — Journal chronologique des sessions

> Journal append-only. Chaque session Claude / Cowork ouvre une entrée à son démarrage et la ferme à sa fin.
> Les entrées les plus récentes sont **en haut** (ordre anti-chronologique pour une relecture rapide).

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
