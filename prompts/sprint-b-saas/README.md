# Sprint B — Pivot SaaS Helvètia Intérim

> **Vision** : transformer le SI interne d'agence en SaaS multi-agences post-pilote.
> **Marque** : `Helvètia Intérim` — voir `docs/adr/0006-saas-pivot.md`.
> **Domaine** : `helvetia-interim.guedou.ch` (sous-domaine personnel du fondateur, staging ET commercial). Migration vers TLD dédié = dette future non bloquante (voir ADR-0006 §3).
> **Cibles (ordre)** : agences d'intérim CH → white-label via MovePlanner → PME opératrices de pools.

## Principes de cette phase

1. **Aucun prompt B ne s'exécute avant validation pilote agence (post J+30)** — sauf B0.1 (branding) et B0.2 (landing statique) qui sont parallélisables.
2. Chaque prompt B suit le protocole `prompts/orchestrator/ORCHESTRATOR.md` §3.
3. `CLAUDE.md` sera amendé par le prompt B0.4 pour refléter le contexte "éditeur SaaS".
4. Pas de commercialisation avant la filialisation juridique (`Helvètia Intérim SA` distincte de l'agence opérée).

## Catalogue

Voir `B-PROMPTS.md` pour la liste complète des 25 prompts répartis en 6 sous-sprints.

## Ordre recommandé

```
B.0 (Fondations) → B.1 (Onboarding self-service) → B.2 (Durcissement multi-tenant) →
B.3 (White-label + multi-cible) → B.4 (Support/Docs/Growth) → B.5 (Tests profonds)
→ Lancement commercial
```

## Prompts rédigés en "patron complet" (comme A0.1/A1.1)

- `B0.1-product-name-domain-branding.md`
- `B1.1-signup-flow.md`
- `B1.2-onboarding-wizard.md`

Les autres prompts sont **catalogués** dans `B-PROMPTS.md` avec DoD résumée, skills requises et dépendances. Ils seront détaillés en "patron complet" au moment de leur exécution effective (pas avant, pour ne pas figer trop tôt des choix qui dépendront du pilote).
