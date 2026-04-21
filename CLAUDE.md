# CLAUDE.md — Règles d'ingénierie du projet Agence d'Intérim

> **Projet** : Système d'information pour agence suisse de travail temporaire, intégrée par API à MovePlanner
> **Version** : 1.0
> **Dernière mise à jour** : 2026-04-21
> **Destinataire** : toute session Claude Code / Cowork travaillant sur ce repo
> **Principe cardinal** : si une règle entre en conflit avec la loi suisse (LSE, CCT, LTr, nLPD), la loi gagne. Toujours.

---

## 1. Contexte à charger avant d'écrire une ligne de code

Toute session commence par lire dans l'ordre :

1. `docs/01-brief.md` — vision métier et périmètre MVP
2. `docs/02-partners-specification.md` — contrat d'interface MovePlanner (source de vérité)
3. `docs/03-plan-de-dev.md` — phasage sprint par sprint
4. `docs/05-architecture.md` — choix techniques et diagrammes
5. `prompts/orchestrator/PROGRESS.md` — état d'avancement réel, qui a fait quoi, où on en est
6. Le ou les `skills/**/SKILL.md` que l'orchestrateur indique pour la tâche en cours

Ne jamais commencer à coder sans avoir lu `PROGRESS.md`. Il contient les décisions déjà prises, les choix techniques figés, les dettes ouvertes et les alertes bloquantes.

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

L'escalade consiste à : bloquer la tâche, ouvrir une issue `compliance/` avec le label `blocker`, notifier dans `SESSION-LOG.md`, et continuer sur une autre tâche si possible.

---

## 9. Mise à jour de ce fichier

Ce CLAUDE.md est **vivant**. Toute évolution passe par une PR avec label `rules-update` et revue de l'équipe (lead tech + PO minimum). L'ADR correspondante est créée dans `docs/adr/`.

---

**Fin de CLAUDE.md v1.0**
