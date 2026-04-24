# CLAUDE.md — Règles d'ingénierie du projet Agence d'Intérim

> **Projet** : Système d'information pour agence suisse de travail temporaire, intégrée par API à MovePlanner. **Phase 2 (post-pilote)** : pivot SaaS multi-agences acté par [ADR-0006](docs/adr/0006-saas-pivot.md) — voir §10.
> **Version** : 1.1
> **Dernière mise à jour** : 2026-04-25 (B0.4 — amendements éditeur SaaS)
> **Destinataire** : toute session Claude Code / Cowork travaillant sur ce repo
> **Principe cardinal** : si une règle entre en conflit avec la loi suisse (LSE, CCT, LTr, nLPD), la loi gagne. Toujours.

---

## 1. Contexte à charger avant d'écrire une ligne de code

Toute session commence par lire dans l'ordre :

1. `docs/01-brief.md` — vision métier et périmètre MVP (phase 1, agence pilote)
2. `docs/01b-brief-saas-pivot.md` — vision phase 2 SaaS (complément non destructif au brief 01)
3. `docs/adr/0006-saas-pivot.md` — décision pivot SaaS, marque, domaine, filialisation
4. `docs/02-partners-specification.md` — contrat d'interface MovePlanner (source de vérité)
5. `docs/03-plan-de-dev.md` — phasage sprint par sprint
6. `docs/05-architecture.md` — choix techniques et diagrammes
7. `prompts/orchestrator/PROGRESS.md` — état d'avancement réel, qui a fait quoi, où on en est (Phase 1 + §9 Phase 2)
8. Le ou les `skills/**/SKILL.md` que l'orchestrateur indique pour la tâche en cours

Ne jamais commencer à coder sans avoir lu `PROGRESS.md`. Il contient les décisions déjà prises, les choix techniques figés, les dettes ouvertes et les alertes bloquantes.

**Pour les sessions sprint B (SaaS)** : lire en plus `prompts/sprint-b-saas/README.md` + `prompts/sprint-b-saas/B-PROMPTS.md` + le prompt B spécifique. La §10 ci-dessous pose les règles éditeur SaaS qui s'appliquent par-dessus celles de phase 1.

---

## 2. Règles de l'art — non négociables

### 2.1 TypeScript

- `strict: true` partout, y compris `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`.
- Aucun `any`. En cas de besoin irréductible, `unknown` + narrowing explicite.
- Aucun `as` hors cas documentés (parse Zod, cast DTO↔Domain avec commentaire justificatif).
- Fonctions pures par défaut ; effets de bord confinés aux *adapters* (couche infrastructure).
- Erreurs typées via `Result<T, E>` ou exceptions domaine (`DomainError` hiérarchie). Jamais de `throw new Error("...")` générique.

### 2.2 Architecture

- **Architecture hexagonale** : `domain/` (pur TS, zéro dépendance externe) → `application/` (use cases) → `infrastructure/` (Prisma, HTTP, SMS, webhooks).
- Règle de dépendance : le domaine ne connaît ni Express, ni Prisma, ni Firestore. Les ports sont des interfaces TS ; les adapters les implémentent.
- Un module = un bounded context. Pas de couplage inter-modules sauf par événements (`EventBus`) ou contrats publics.
- Les entités portent leur invariants (constructeurs privés + *factories* qui valident). Pas de modèle anémique.

### 2.3 Tests

- Pyramide : **70% unit, 20% intégration, 10% E2E**.
- Couverture minimale : **85% des branches du domain**, **70% global**.
- Unit tests : pas de mock de code qu'on possède ; on mock les ports, jamais les implémentations.
- Tests d'intégration : Postgres et Redis en Testcontainers, pas de mock.
- Tests E2E : Playwright pour le back-office, Supertest pour l'API publique.
- Tests de contrat MovePlanner : collection Pact ou équivalent, rejouée en CI.
- Règle : **aucun PR fusionné sans tests verts**. Les tests flaky sont traités comme des bugs.

### 2.4 Qualité de code

- ESLint `@typescript-eslint/strict` + `eslint-plugin-import` + `eslint-plugin-security`.
- Prettier avec config figée, pas de débat sur le style.
- `tsc --noEmit` exécuté en pré-commit (Husky + lint-staged).
- Complexité cyclomatique max 10 par fonction. Au-delà : refactor ou justification écrite en commentaire.
- Longueur max 80 lignes par fonction. Au-delà : extraction.
- Noms en anglais pour le code ; commentaires et docs métier en français (c'est un projet suisse romand).

### 2.5 Git et revue

- `main` protégée, jamais de push direct. PR obligatoire avec au moins 1 reviewer.
- Commits conventionnels : `feat(payroll): calcul 13e salaire au prorata` — type parmi `feat|fix|docs|test|chore|refactor|perf|security|compliance`.
- Un commit = un changement atomique qui laisse la base verte (tests + lint + types).
- Rebase avant merge. Pas de merge commits dans l'historique de `main`.
- Les PR liées à la conformité (LSE, CCT, nLPD, paie) portent le label `compliance-review` et exigent la validation du juriste/DPO désigné dans `docs/07-rôles.md`.

### 2.6 Documentation

- Chaque module public expose un `README.md` (rôle, API, exemples).
- Les décisions techniques significatives → **ADR** dans `docs/adr/NNNN-titre.md`, format [Michael Nygard](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions).
- Les schémas de données critiques → diagramme Mermaid dans le README du module.
- Le code *se lit* — les commentaires expliquent le *pourquoi*, jamais le *quoi*. Si le quoi n'est pas lisible, le code est à réécrire.

---

## 3. Règles spécifiques au contexte suisse

### 3.1 Montants et devises

- Tous les montants en **Rappen** (centimes CHF) stockés en `bigint` ou `integer` — jamais de flottant.
- Le type `Money` est un value object immutable avec opérations `add/sub/multiply/allocate` (voir pattern Fowler).
- Les arrondis suivent la règle **suisse légale** : arrondi au 5 centimes pour les montants bruts à payer ; arrondi comptable au centime près pour l'interne.
- TVA 8.1% stockée en **basis points** (`810`) pour éviter les erreurs de virgule flottante.

### 3.2 Dates et fuseaux

- Stockage UTC. Affichage `Europe/Zurich`. Dates civiles sans heure → type `LocalDate` (pas de Date JS avec heure 00:00).
- Calculs de semaine : **ISO week** (lundi → dimanche), jamais la semaine US.
- Jours fériés : table par canton (`holidays.ch` comme référence), pas hardcodés.

### 3.3 Identifiants

- `agencyId` (multi-tenant) obligatoire sur **toute** collection.
- `AVS` (13 chiffres format `756.XXXX.XXXX.XX`) validé via checksum EAN-13.
- `IDE` (format `CHE-XXX.XXX.XXX`) validé via checksum mod 11.
- `IBAN` validé via mod 97.

### 3.4 Conformité par design

- Aucune donnée personnelle en clair dans les logs. Pseudonymisation (hash `staffId`) ou masquage.
- Toute modification d'un `PartnerDocument`, `EmploymentContract`, `Payslip`, `Invoice` → entrée `audit_logs` append-only, conservation 10 ans.
- Les secrets (clés API, HMAC) ne résident **jamais** dans le code ni dans les env commitées ; seulement dans le secret manager (Infomaniak Secret Manager / Swisscom KMS).
- Chiffrement au repos pour tous les documents légaux (permis, attestations, bulletins) — CMEK si l'hébergeur le propose.

### 3.5 Multi-tenant

- Chaque requête authentifiée porte un `agencyId` dérivé du JWT.
- Toute query Prisma est wrappée par un middleware qui injecte `where: { agencyId }`. Pas d'exception.
- Les tests vérifient explicitement l'**isolation** : agence A ne lit jamais les données de agence B.
- **Tenant-guard Prisma** (via `$extends`) est **actif en prod** et doit lever une erreur runtime si une query arrive sans `agencyId` dans le context `AsyncLocalStorage`. Aucune exception. (cf. `apps/api/src/infrastructure/db/tenant-guard.ts`).
- **Test de non-régression** : toute PR qui modifie un repository doit démontrer que le scénario "requête cross-tenant" échoue comme attendu (test E2E ou intégration explicite). Le contournement du tenant-guard "pour aller plus vite" est un motif de refus de PR.
- **Staff éditeur** (rôle `editor_staff`, post B0.4 / phase 2 SaaS) : utilisateurs avec accès technique multi-tenant pour debug/support. **Tous leurs accès sont loggés dans `audit_logs_staff`** (table séparée du `audit_logs` tenant-interne). Ces logs sont consultables par chaque tenant via un rapport "Qui a consulté mes données ?" — obligation contractuelle DPA, voir §10.2.

---

## 4. Règles spécifiques à l'intégration MovePlanner

- Le contrat d'interface est la **source de vérité** ; aucune liberté prise côté agence sans PR cross-team.
- Toutes les requêtes sortantes portent un `Idempotency-Key` (UUID v4) persisté dans une table `outbound_idempotency_keys` pour rejeu sûr.
- Tout webhook entrant est **vérifié HMAC-SHA256** avant toute autre action. Une signature invalide = log sécurité + 401. Pas de retry côté consommateur.
- Tolérance d'horloge webhooks : ±5 minutes. Au-delà : rejet (protection replay).
- Rate limit sortant respecté côté client : **100 req/min**, **1000 req/jour**. Un circuit breaker protège l'appelant (opossum ou équivalent).
- Versioning : on ne consomme que `/api/v1/…`. Si MovePlanner publie `v2`, PR de migration explicite avec tests de non-régression.
- Les webhooks entrants sont *persistés avant traitement* dans une table `inbound_webhook_events` (idempotence sur `X-MovePlanner-Event-Id`). Puis dispatch via `EventBus` / BullMQ. Pas de traitement synchrone dans le handler HTTP.

---

## 5. Sécurité — minimum vital

- Authentification back-office : Firebase Auth ou Supabase Auth, MFA obligatoire pour les rôles `agency_admin` et `payroll_officer`.
- Portail intérimaire : magic link email ou OTP SMS. Jamais de mot de passe stocké côté agence.
- Signature électronique des contrats : fournisseur certifié **ZertES** (Swisscom Trust Signing Services, SuisseID ou équivalent). Pas de DocuSign US pour les contrats de mission.
- HTTPS + TLS 1.3 partout. HSTS sur les domaines publics.
- CSP strict, `Permissions-Policy`, `Referrer-Policy: strict-origin-when-cross-origin`.
- Dépendances : `npm audit` en CI, Dependabot activé, pin des versions majeures.
- Pentest externe avant go-live (budget prévu sprint A.6).

---

## 6. Conventions de nommage

- Fichiers : `kebab-case.ts`. Tests : `*.test.ts` ou `*.spec.ts` à côté du fichier testé.
- Classes et types : `PascalCase`. Fonctions et variables : `camelCase`. Constantes : `UPPER_SNAKE_CASE`.
- DTO (transport) suffixés `…Dto`. Entités domaine sans suffixe. Modèles Prisma dans `schema.prisma` uniquement — jamais exposés au domaine.
- Branches Git : `feat/NNNN-titre`, `fix/NNNN-titre`, `chore/NNNN-titre` où `NNNN` = ID du ticket ou du prompt orchestrateur.

---

## 7. Comment travailler avec l'orchestrateur de prompts

1. L'orchestrateur lit `PROGRESS.md` et désigne **le prochain prompt** à exécuter.
2. Toute session Claude qui démarre un prompt doit :
   - Ouvrir `prompts/orchestrator/SESSION-LOG.md` et ajouter une entrée de début (timestamp, prompt ID, objectif).
   - Lire les skills listées dans l'en-tête du prompt.
   - Exécuter la tâche **dans une branche dédiée** `feat/NNNN-…`.
   - Ouvrir une PR avec le template `docs/pr-template.md`.
   - Ajouter une entrée de fin au `SESSION-LOG.md` : livrables, décisions, dette, prochain prompt suggéré.
   - Mettre à jour `PROGRESS.md` (statut du prompt, pointeur vers PR, blockers éventuels).
3. Si la session approche de la limite de contexte, l'orchestrateur **résume** l'état courant dans `SESSION-LOG.md` sous la forme du `RESUME-TEMPLATE.md`. La session suivante peut reprendre sans perte.

Voir `prompts/orchestrator/ORCHESTRATOR.md` pour le détail du protocole.

---

## 8. Refus et escalade

Claude **refuse** et escalade vers un humain quand :

- Une demande contournerait la CCT (taux horaire sous minimum, pas de 13ᵉ, pas de vacances prorata).
- Une demande contournerait la LTr (>50h/sem en bâtiment, pas de repos 11h).
- Une demande entraînerait un transfert de données personnelles hors Suisse sans DPA.
- Une demande modifierait directement le code MovePlanner depuis ce projet.
- Un blocker de conformité est détecté pendant l'exécution (ex. intérimaire sans AVS enregistré, permis expiré).

**Cas additionnels en contexte SaaS éditeur (phase 2, post-ADR-0006)** :

- Une demande implique de **bypasser le tenant-guard** "pour aller plus vite" ou "juste pour ce cas" — refus systématique, c'est la principale surface de fuite cross-tenant.
- Une demande implique de **consulter les données d'un tenant** (lecture ou écriture) sans justificatif ticket support ou autorisation explicite fondateur — refus + suggestion d'ouvrir un ticket d'abord.
- Une demande implique un **export de données tenant** vers une destination hors du tenant concerné (autre tenant, staff éditeur perso, tiers) sans DPA en place ou ticket légitime — refus.
- Une demande implique une **modification silencieuse de CGU / pricing / DPA / politique de confidentialité** côté client sans préavis 14 jours documenté — refus, escalade au fondateur + juriste.
- Une demande implique de **désactiver un audit log** (tenant ou staff) "temporairement" — refus, c'est une obligation contractuelle et nLPD non-négociable.

L'escalade consiste à : bloquer la tâche, ouvrir une issue `compliance/` avec le label `blocker`, notifier dans `SESSION-LOG.md`, et continuer sur une autre tâche si possible.

---

## 9. Mise à jour de ce fichier

Ce CLAUDE.md est **vivant**. Toute évolution passe par une PR avec label `rules-update` et revue de l'équipe (lead tech + PO minimum). L'ADR correspondante est créée dans `docs/adr/`.

Pour les évolutions liées au pivot SaaS (phase 2), ajouter aussi le label `saas-review` (cf. `docs/pr-template.md`).

---

## 10. Contexte éditeur SaaS

À partir du pivot validé en [ADR-0006](docs/adr/0006-saas-pivot.md), Helvètia Intérim est **éditeur SaaS** et opère **des agences clientes distinctes** (la marque produit est `Helvètia Intérim`, le domaine technique `helvetia-interim.guedou.ch`). Règles supplémentaires qui s'appliquent **par-dessus** celles des §1 à §9, sans les annuler.

### 10.1 Sous-traitance nLPD

- L'éditeur est **sous-traitant** au sens de la nLPD pour chaque agence cliente.
- Aucun usage des données tenant hors strict nécessaire au service : pas de profiling, pas d'entraînement IA sur données tenant sans consentement explicite, pas d'enrichissement marketing.
- DPA signé avec chaque tenant (template livré en B0.5) — à ne jamais outrepasser.
- L'agrégation cross-tenant (statistiques produit, benchmarks anonymisés) n'est autorisée qu'avec **anonymisation irréversible** (k-anonymity ≥ 5) et mention explicite dans le DPA.

### 10.2 Accès staff éditeur aux données tenant

- Tout accès lecture/écriture d'un staff éditeur (rôle `editor_staff`) à des données tenant est **tracé** dans `audit_logs_staff` (table séparée du `audit_logs` tenant-interne).
- Trace minimum : `who` (uid staff), `when` (timestamp UTC), `tenant_id`, `action` (read/write + table+id), `justification` textuelle obligatoire (ticket support ID ou autorisation fondateur).
- Accès **lecture** pour debug autorisé seulement sur ticket support ouvert ou après autorisation fondateur explicite (asynchrone OK, mais référencée).
- Accès **écriture** sur données tenant interdit sauf correction d'incident documenté (post-mortem joint au ticket).
- Chaque tenant peut consulter le rapport "Qui a consulté mes données ?" depuis son back-office (build : B2.3).

### 10.3 Isolation cross-tenant — niveau d'exigence

- Requête sans filter `agencyId` (ou contournement du tenant-guard) = **bug critique**, bloquant en CI. Le tenant-guard de A1.x doit être actif **partout en prod**, levée d'erreur runtime si AsyncLocalStorage tenant absent.
- Tests E2E de fuite cross-tenant (B2.2 — 50+ scénarios) rejoués à chaque PR touchant `domain/`, `application/repositories/`, ou tout adapter Prisma.
- Un bug de fuite cross-tenant n'est plus un inconvénient comme en phase 1 : c'est une **violation contractuelle DPA + violation nLPD** avec obligation d'**annonce PFPDT sous 72h** (cf. `skills/compliance/nlpd-privacy/SKILL.md`). Les tests sont le seul filet.

### 10.4 Provisionnement et cycle de vie tenant

- **Création** tenant uniquement via flow onboarding B1.1 (signup self-service + Firebase Identity Platform multi-tenancy auto). Aucune création directe en DB sans trace.
- **Suspension** tenant sur `invoice.payment_failed` (Stripe webhook B2.1) → data passe en read-only pendant 7 jours, puis archive.
- **Suppression** tenant : seulement après demande explicite client + délai 30 jours + data export fourni au client (droit à l'effacement nLPD vs obligation de conservation 10 ans pour données légales = on archive offline, on ne purge que les PII non-légales).
- **Aucune création/suspension/suppression manuelle hors flow** : escalade obligatoire.

### 10.5 Communication avec les clients agences

- Aucune **modification de flow utilisateur-facing** (UI majeure, pricing, fonctionnalité retirée) sans préavis 14 jours aux clients par email + bandeau in-app.
- API publique tenant versionnée SemVer : `/api/v1/`, `/api/v2/`. Les clients consomment une version fixe, pas `latest`.
- **Breaking change** sur l'API publique = nouvelle version majeure + période de cohabitation 90 jours minimum + guide de migration documenté (`docs/migrations/v1-to-v2.md`).
- Les pannes (downtime, dégradation) sont communiquées sur la statuspage `status.helvetia-interim.guedou.ch` en quasi-temps réel (≤ 15 min).

### 10.6 Filialisation et conflit d'intérêt

Cf. ADR-0006 §4. Avant l'onboarding du **premier client agence SaaS externe** :

- Création de l'entité juridique `Helvètia Intérim SA` (éditrice du SaaS) distincte de l'agence opérée par le fondateur en phase 1 pilote.
- Personnel éditeur strictement séparé du personnel de l'agence pilote (pas de double rôle ambigu).
- Clause contractuelle dans le contrat SaaS + politique de confidentialité : "L'éditeur n'opère aucune activité concurrente d'agence de location de services". Si le fondateur garde l'agence pilote comme tenant showroom, c'est un tenant comme un autre, sans accès privilégié au-delà du standard.

Tant que la filialisation n'est pas effective, **interdiction d'onboarding tenant externe** — escalade au fondateur si un tenant externe tente de signup.

---

**Fin de CLAUDE.md v1.1**
