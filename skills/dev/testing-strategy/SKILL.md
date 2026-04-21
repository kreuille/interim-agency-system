# Skill — Stratégie de tests

## Rôle
Tech lead / QA sénior. Garantit que le code livré fait ce qu'il prétend faire, dans tous les cas prévus par la loi et par le métier.

## Quand l'utiliser
Dès qu'on écrit du code. Tout prompt qui ajoute une fonctionnalité doit spécifier les tests à écrire.

## Concepts clés
- **Pyramide** : 70% unit (rapides, isolés), 20% intégration (base + queue réelles en Testcontainers), 10% E2E (parcours complet).
- **Tests de contrat** avec MovePlanner : fixtures d'événements réels rejoués en CI.
- **Tests de conformité** : scénarios dédiés (CCT, LTr, nLPD, permis).
- **Seuils de couverture** : ≥ 85% sur `packages/domain/`, ≥ 70% global. Rupture en CI sinon.

## Règles dures
- Aucun PR mergé sans test sur le chemin heureux + au moins une erreur attendue.
- Les tests flaky sont des **bugs**, pas des irritants. Ils sont investigués, pas retry.
- Les mocks ne remplacent jamais une implémentation qu'on possède. On mocke les ports (interfaces), pas les classes concrètes.
- Les tests d'intégration utilisent Testcontainers (Postgres réel, Redis réel). Pas de SQLite de substitution.
- Les données de test sont **déterministes** : `Clock` injecté, seeds fixes, pas de `Math.random()` ni `Date.now()`.

## Pratiques
- **Outil unit** : Vitest. Rapide, ESM-first.
- **Outil intégration** : Vitest + `@testcontainers/postgresql` + `@testcontainers/redis`.
- **Outil E2E API** : Supertest. UI : Playwright.
- **Fixtures** : fonctions `buildWorker({ ... })`, `buildMission({ ... })` avec overrides. Pas de JSON hard-codé partout.
- **Naming** : `describe('RegisterWorkerUseCase', () => { it('rejects invalid AVS', …) })`. Un `it` = un scénario.
- **Ordre** : tests indépendants, exécutables dans n'importe quel ordre (`--parallel`).

## Tests obligatoires par module

| Module | Cas à couvrir en plus du chemin heureux |
|--------|------------------------------------------|
| workers | AVS invalide, IBAN invalide, doublon, permis expiré, isolation tenant |
| availability | Créneau chevauchant, source stale, TTL expiré, push MP timeout |
| proposals | HMAC invalide, replay attack (timestamp ±5min), idempotency double |
| contracts | Taux < minimum CCT, signature OTP expirée, branche inconnue |
| timesheets | Dépassement 50h/sem, pause manquante < 30min si > 7h, dispute + sign |
| payroll | Nuit + dim cumulés, 13e prorata, LPP seuil, changement barème IS en cours de mois |
| invoicing | QR-bill payload valide, TVA 8.1%, relance J+7, arrondi 5cts |

## Pattern — test d'un use case

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { RegisterWorkerUseCase } from '@app/workers/register-worker.use-case'
import { InMemoryWorkerRepository } from '@test/fakes/in-memory-worker-repository'
import { FakeAuditLogger } from '@test/fakes/fake-audit-logger'
import { FrozenClock } from '@test/fakes/frozen-clock'

describe('RegisterWorkerUseCase', () => {
  let usecase: RegisterWorkerUseCase
  let workers: InMemoryWorkerRepository
  let audit: FakeAuditLogger
  let clock: FrozenClock

  beforeEach(() => {
    workers = new InMemoryWorkerRepository()
    audit = new FakeAuditLogger()
    clock = FrozenClock.at('2026-05-01T10:00:00Z')
    usecase = new RegisterWorkerUseCase(workers, audit, clock)
  })

  it('registers a worker and writes audit', async () => {
    const res = await usecase.execute(validInput())
    expect(res.isOk()).toBe(true)
    expect(await workers.count()).toBe(1)
    expect(audit.entries).toHaveLength(1)
    expect(audit.entries[0].kind).toBe('WorkerRegistered')
  })

  it('rejects invalid AVS checksum', async () => {
    const res = await usecase.execute({ ...validInput(), avs: '756.0000.0000.00' })
    expect(res.isErr()).toBe(true)
    expect(res._unsafeUnwrapErr().kind).toBe('InvalidAvs')
  })

  it('rejects duplicate AVS within same agency', async () => {
    await usecase.execute(validInput())
    const res = await usecase.execute(validInput())
    expect(res.isErr()).toBe(true)
  })

  it('allows same AVS across different agencies', async () => {
    await usecase.execute(validInput({ agencyId: 'a' }))
    const res = await usecase.execute(validInput({ agencyId: 'b' }))
    expect(res.isOk()).toBe(true)
  })
})
```

## Pièges courants
- Tester les mocks plutôt que le code. Assertions sur "le mock a été appelé avec ..." sont faibles ; préférer des fakes qui captent l'état réel.
- Tests couplés à l'implémentation (vérifier l'ordre des appels Prisma). Refactoriser = tout casser.
- Un test = plusieurs scénarios. Décomposer.
- Base en `test` partagée entre tests parallèles = race conditions. Isolation par schéma ou par container.

## Références
- `CLAUDE.md §2.3`
- https://vitest.dev
- https://testcontainers.com
- Kent Beck, "Test-Driven Development"
