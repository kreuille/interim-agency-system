# ADR-0001 — Choix de la stack technique

- **Date** : 2026-04-21
- **Statut** : accepté
- **Décideurs** : fondateur, lead tech, PO
- **Contexte du prompt** : A0.1 — init monorepo

## Contexte

Nous démarrons le SI d'une agence suisse d'intérim intégrée par API à MovePlanner. Nous devons choisir une stack technique qui nous permette :
- un time-to-market de 10–12 semaines pour un MVP complet (paie + facturation + intégration MP),
- une conformité forte au contexte suisse (Rappen, AVS, IDE, IBAN, dates ISO week, audit 10 ans),
- une équipe technique raisonnablement staffable en Suisse romande,
- un alignement avec la stack supposée de MovePlanner (Node.js/TypeScript/Firestore ou Postgres) pour faciliter les intégrations et réduire la friction d'apprentissage croisé,
- un hébergement en Suisse obligatoire (nLPD, confiance clients).

## Options considérées

1. **Node.js 20 + TypeScript + PostgreSQL + Next.js** (retenu)
2. Java Spring Boot + PostgreSQL + React
3. .NET 8 + PostgreSQL + Blazor
4. Python Django + PostgreSQL + React

## Décision

Nous retenons **Node.js 20 + TypeScript strict + PostgreSQL 16 + Next.js 14 App Router + Prisma + BullMQ (Redis)**.

## Conséquences

### Positives
- **Un seul langage** (TypeScript) sur le back, le front-admin et le portail mobile → rotation facile des devs, partage de types via monorepo.
- Ecosystème riche pour les briques CH (swissqrbill, iso20022, swissdec-connector).
- DX Prisma excellent, migrations déclaratives.
- Next.js 14 App Router = SSR + Server Actions = productivité.
- **Alignement stack supposée MovePlanner** → partage de patterns, de types d'API contractuels, de compétences dev.

### Négatives
- Écosystème Node.js mouvant (ESM vs CJS encore parfois douloureux).
- Perf raw moins bonne qu'un back Java/.NET sur certains workloads lourds (calculs paie massifs) — à monitorer.
- TypeScript strict impose une discipline, courbe d'apprentissage pour dev JS sans TS.

### Neutres
- Postgres 16 : solide, pas de surprise. Extensions utiles (uuid-ossp, pgcrypto, ltree).
- Hébergement Infomaniak Public Cloud (défaut) ou Exoscale : les deux compatibles.

## Notes

Cette décision sera revisitée si :
- un acteur suisse publie une stack ERP open source mieux adaptée,
- MovePlanner communique officiellement sa stack et elle diverge significativement (ex. Kotlin + gRPC).

## Liens

- `docs/01-brief.md §6`
- `docs/03-plan-de-dev.md §6`
- `docs/05-architecture.md §3`
- `CLAUDE.md §2.1`
