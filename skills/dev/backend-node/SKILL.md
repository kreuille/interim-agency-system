# Skill — Backend Node.js / TypeScript

## Rôle
Dev backend senior. Code propre, testé, observable. Écrit du TypeScript strict et refuse les raccourcis qui coûteront cher plus tard.

## Quand l'utiliser
Tout prompt qui touche à `apps/api/` ou `packages/domain/`, `packages/application/`. Dès qu'on parle de use case, entité, adapter, middleware.

## Concepts clés
- **Architecture hexagonale** : domain pur ← application ← infrastructure.
- **Value objects** immutables pour les primitives métier (`Money`, `Avs`, `Ide`, `Iban`, `WeekIso`).
- **Result<T, E>** pour les erreurs attendues, exceptions pour les bugs.
- **Ports & adapters** : le domaine définit des interfaces, l'infrastructure les implémente.
- **Event-driven interne** : effets de bord déclenchés via `EventBus`, pas via appels directs.

## Règles dures
- `tsconfig` : `strict`, `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Aucun `any`. Aucun `as` non justifié.
- Une fonction = une responsabilité. ≤ 80 lignes. Complexité cyclomatique ≤ 10.
- Les imports du domaine depuis l'infrastructure sont interdits (ESLint rule `no-restricted-imports`).
- Validation runtime avec Zod en bordure (controllers, consumers, adapters HTTP).
- Les secrets sont lus au démarrage et exposés via un `ConfigService`. Jamais `process.env` en dehors.

## Pratiques
- Un module = un dossier avec `index.ts` qui exporte l'API publique.
- Les entités portent leurs invariants : constructeurs privés, factories statiques qui valident.
- Les use cases retournent `Promise<Result<TOutput, DomainError>>`.
- Les controllers HTTP sont **minces** : parse → appelle use case → map réponse. Aucune logique métier.
- Les jobs BullMQ ont un **job name stable** et un **handler pur** qui reçoit ses dépendances par DI (awilix ou tsyringe).
- Chaque use case a au moins un test unit couvrant le chemin heureux + 2 erreurs typées.

## Pattern — squelette use case

```typescript
// packages/application/workers/register-worker.use-case.ts
import { z } from 'zod'
import { Result, ok, err } from 'neverthrow'
import { TempWorker } from '@domain/workers'
import { Avs, Iban, Canton } from '@domain/shared'
import type { WorkerRepository } from '@domain/workers/ports'
import type { AuditLogger } from '@domain/compliance/ports'
import type { Clock } from '@domain/shared/clock'

export const RegisterWorkerInput = z.object({
  agencyId: z.string().uuid(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  avs: z.string(),
  iban: z.string(),
  canton: z.string().length(2),
  // ...
})
export type RegisterWorkerInput = z.infer<typeof RegisterWorkerInput>

export type RegisterWorkerError =
  | { kind: 'InvalidAvs' }
  | { kind: 'InvalidIban' }
  | { kind: 'DuplicateAvs' }

export class RegisterWorkerUseCase {
  constructor(
    private readonly workers: WorkerRepository,
    private readonly audit: AuditLogger,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterWorkerInput): Promise<Result<{ id: string }, RegisterWorkerError>> {
    const avs = Avs.parse(input.avs)
    if (avs.isErr()) return err({ kind: 'InvalidAvs' })
    const iban = Iban.parse(input.iban)
    if (iban.isErr()) return err({ kind: 'InvalidIban' })

    const existing = await this.workers.findByAvs(input.agencyId, avs.value)
    if (existing) return err({ kind: 'DuplicateAvs' })

    const worker = TempWorker.create({
      agencyId: input.agencyId,
      firstName: input.firstName,
      lastName: input.lastName,
      avs: avs.value,
      iban: iban.value,
      canton: Canton.parseOrThrow(input.canton),
      createdAt: this.clock.now(),
    })
    await this.workers.save(worker)
    await this.audit.log({ kind: 'WorkerRegistered', workerId: worker.id, at: this.clock.now() })

    return ok({ id: worker.id })
  }
}
```

## Pièges courants
- Injecter Prisma dans le domaine (détruit le découpage). Toujours passer par un Port.
- Utiliser `Date.now()` directement (rend les tests non déterministes). Toujours via `Clock`.
- Oublier `agencyId` dans un query (fuite multi-tenant). ESLint custom rule à terme.
- Throw au lieu de Result. Réserver throw aux invariants bugs.
- Mettre le try/catch autour d'un use case dans le controller. Le use case retourne déjà un Result ; pas besoin de try/catch, mapper l'erreur via exhaustive switch.

## Références
- `CLAUDE.md §2`
- `docs/05-architecture.md §2` et §4
- https://martinfowler.com/bliki/ValueObject.html
- Neverthrow : https://github.com/supermacro/neverthrow
