# ADR-0006 — Pivot SaaS post-pilote (Helvètia Intérim)

- **Date** : 2026-04-23
- **Statut** : accepté
- **Décideurs** : fondateur
- **Contexte** : fin phase dev, décision stratégique sur l'avenir du produit
- **Supersede** : complète ADR-0001 sans l'annuler

## Contexte

Le projet a été développé initialement pour être le SI interne d'une agence suisse de travail temporaire (l'agence opérée par le fondateur). L'architecture est **multi-tenant par design** depuis A0.5 (`agencyId` sur toute entité, Firebase Identity Platform multi-tenancy, isolation testée cross-tenant).

À la fin du développement (fin avril 2026, 44/48 prompts catalogue mergés), le fondateur décide d'exploiter ce fait architectural pour **pivoter vers un modèle SaaS** post-pilote.

## Décision

### 1. Stratégie

Pivot SaaS pur **après** validation du pilote opérationnel (post-J+30). L'agence initialement opérée par le fondateur sert de **client pilote showroom** et de **proof by dogfooding** pour démarrer la vente SaaS.

**Phase 1 (actuelle → J+30)** : pilote avec l'agence du fondateur en conditions réelles, MovePlanner client principal.
**Phase 1.5 (en parallèle)** : construction silencieuse de la surface SaaS (landing, signup, onboarding, billing, durcissement multi-tenant). Ne distrait pas du pilote.
**Phase 2 (post J+30)** : bascule commerciale, onboarding des premiers clients SaaS externes.

### 2. Ordre de priorité des cibles

1. **Agences d'intérim CH** (primaire 70% effort) — marché mature, willingness to pay 200-500 CHF/agence/mois, besoin fort de multi-tenancy stricte et white-label.
2. **White-label via MovePlanner** (secondaire) — revenue share avec MP, qui revend aux ~50-100 partenaires intérim. Un deal, gros impact.
3. **PME opératrices de temporaires** (opportuniste) — flow simplifié, pas de besoin CCT complet, plus petit marché CH.

### 3. Marque et domaine

- **Nom produit** : `Helvètia Intérim` (conservé — déjà ancré dans le design system web-admin mergé sur `main` via PR #71).
- **Domaine** : `helvetia-interim.guedou.ch` (sous-domaine du domaine personnel du fondateur). Utilisé aussi bien en staging/dev qu'en commercial phase 2. Décision du fondateur : zéro coût, zéro délai, contrôle direct.
- **Sous-domaines prévus** :
  - `www.helvetia-interim.guedou.ch` → landing publique.
  - `app.helvetia-interim.guedou.ch` → back-office admin tenants.
  - `api.helvetia-interim.guedou.ch` → API publique.
  - `m.helvetia-interim.guedou.ch` → portail intérimaire PWA.
  - `docs.helvetia-interim.guedou.ch` → documentation publique.
  - `status.helvetia-interim.guedou.ch` → statuspage publique.
  - `app.{tenantSlug}.helvetia-interim.guedou.ch` ou `app.helvetia-interim.guedou.ch/t/{tenantSlug}` → espace tenant (arbitrage en B3.1 selon faisabilité SSL wildcards niveau 3+).
- **Dette future** (non bloquante) : migration vers TLD dédié (`helvetia-interim.ch` ou équivalent) envisageable si :
  1. Le positionnement commercial face aux agences CH demande un domaine plus "corporate" que `*.guedou.ch`.
  2. Le fondateur souhaite découpler l'identité éditeur SaaS de son identité personnelle (`guedou.ch`) — pertinent lors de la filialisation juridique `Helvètia Intérim SA`.
  3. Scale international (hors CH).
  La migration est techniquement triviale (DNS + updates config) mais commercialement coûteuse une fois les premiers clients onboardés. À arbitrer par un prompt ad-hoc `AH.NNN` le moment venu, pas avant.
- **Note perception** : le nom "Intérim" restreint les cibles 2 et 3. Prévoir tagline inclusive ("pour agences et opérateurs") et à terme éventuellement 2e marque produit si le pivot réussit.

### 4. Filialisation et conflit d'intérêt

Action **impérative avant onboarding du premier client agence SaaS** :

- Création d'une entité juridique distincte `Helvètia Intérim SA` (éditrice du SaaS).
- L'agence initiale du fondateur (qui a servi de pilote) est soit liquidée, soit transférée à un repreneur, soit gardée comme "tenant showroom" **mais avec personnel séparé et accès isolé du staff éditeur**.
- Clause contractuelle explicite dans le contrat SaaS + dans la politique de confidentialité : "Helvètia Intérim SA en tant qu'éditeur n'opère aucune activité concurrente d'agence de location de services".
- DPA client type à signer avec chaque tenant agence cliente.

## Conséquences

### Positives

- Architecture déjà multi-tenant : zéro refonte, juste un ajout de couche (surface publique, billing, onboarding).
- Revenue récurrent prévisible (SaaS) plutôt que volume aléatoire (agence).
- Scale hors Suisse envisageable à terme si marque évolue.
- Dogfooding authentique : le produit a été stressé 2-4 semaines en conditions réelles avant d'être vendu.

### Négatives

- Ajout de complexité : billing Stripe, onboarding self-service, support, docs publiques, churn management, DPA par tenant.
- Distraction potentielle pendant le pilote si mal géré (règle : aucune touche commerciale SaaS avant go-live agence validé).
- Conflit d'intérêt à neutraliser juridiquement + perceptuellement.
- Le nom "Intérim" restreint l'upselling vers PME et white-label MP.
- Cycle de vente long (2-6 mois par agence cliente) vs urgence de cash-flow.

### Neutres

- Périmètre technique : +25 prompts sprint B à livrer sur 8-10 semaines post-go-live.
- Hébergement GCP déjà prévu, pas de changement.
- Équipe tech : pas besoin d'expansion immédiate, la plomberie existe.

## Notes opérationnelles

- Pas de touche commerciale SaaS avant go-live agence validé (J+30 pilote stable).
- La surface publique doit être prête le jour J+30 (landing, signup, onboarding, billing) pour commencer à onboarder les 2-3 premiers clients manuellement.
- Passage au self-service onboarding complet à M+3 (une fois les premiers onboardings manuels débuggés).

## Liens

- `prompts/sprint-b-saas/B-PROMPTS.md` — catalogue des 25 prompts SaaS.
- `docs/go-to-market/` — pack go-to-market externe déjà livré.
- `CLAUDE.md` — à amender en sprint B.0.4 pour contexte "éditeur SaaS".
- `docs/01-brief.md` — à compléter par `docs/01b-brief-saas-pivot.md` (non-destructif).
