# Skill — Base de données PostgreSQL / Prisma

## Rôle
DBA + backend senior. Conçoit un schéma durable, indexé correctement, migrable sans downtime, et qui résiste à la montée en charge pilote (1000 intérimaires, 10k missions/an).

## Quand l'utiliser
Tout prompt qui touche `schema.prisma`, une migration, un query critique, un rapport.

## Concepts clés
- **Multi-tenant par `agencyId`** : indexé en tête de chaque index composite.
- **Soft delete** via `deletedAt` pour les entités avec obligation de conservation.
- **Audit append-only** : table `audit_logs` dédiée, pas de suppression.
- **Montants en `BIGINT`** (Rappen). Jamais de `NUMERIC` ni `FLOAT` pour de l'argent.
- **Timezone UTC** en base, conversion à l'affichage.

## Règles dures
- Chaque table a : `id UUID PRIMARY KEY`, `agency_id UUID NOT NULL`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`, `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
- Tous les `agency_id` ont un index : `CREATE INDEX ... ON table (agency_id, ...)`.
- Pas de `NOT NULL` ajouté sur une colonne existante sans migration en 3 étapes (ajout nullable → backfill → `SET NOT NULL`).
- Pas de DROP COLUMN en une étape : `expand and contract` (deprecate → stop write → stop read → drop).
- Une migration = un changement cohérent. Pas de migration qui mélange schéma et données massives.
- Les foreign keys sont explicitement nommées (`fk_timesheet_worker`) pour faciliter le rollback.
- `ON DELETE` : par défaut `RESTRICT`. Jamais `CASCADE` sur des données légales (contrats, paie).

## Pratiques
- **Prisma** : utiliser `@@map` pour les noms snake_case en base et PascalCase en TS.
- Migrations générées par `prisma migrate dev`, review manuelle avant commit.
- Requêtes lourdes : `EXPLAIN (ANALYZE, BUFFERS)` en dev pour valider.
- Index composites ordonnés par sélectivité : `(agency_id, status, created_at DESC)` pour "propositions en attente récentes".
- Partitionnement à considérer dès 10M lignes (timesheets) : partitionnement par `work_date` trimestriel.
- Backup : `pg_dump` quotidien + WAL archiving pour PITR (point-in-time recovery). Test de restauration mensuel.

## Pattern — schema Prisma minimal

```prisma
// schema.prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

model TempWorker {
  id          String    @id @default(uuid()) @db.Uuid
  agencyId    String    @map("agency_id") @db.Uuid
  firstName   String    @map("first_name")
  lastName    String    @map("last_name")
  avs         String    @unique
  iban        String
  canton      String    @db.Char(2)
  createdAt   DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt   DateTime  @updatedAt       @map("updated_at") @db.Timestamptz(6)
  deletedAt   DateTime? @map("deleted_at") @db.Timestamptz(6)

  documents       WorkerDocument[]
  availabilities  WorkerAvailability[]

  @@index([agencyId, deletedAt])
  @@index([agencyId, lastName])
  @@map("temp_workers")
}

model AuditLogEntry {
  id         String   @id @default(uuid()) @db.Uuid
  agencyId   String   @map("agency_id") @db.Uuid
  actor      String
  action     String
  entityType String   @map("entity_type")
  entityId   String   @map("entity_id") @db.Uuid
  payload    Json
  occurredAt DateTime @map("occurred_at") @db.Timestamptz(6)
  @@index([agencyId, occurredAt])
  @@index([entityType, entityId])
  @@map("audit_logs")
}
```

## Middleware multi-tenant (obligatoire)

```typescript
// infrastructure/persistence/prisma/multi-tenant.middleware.ts
prisma.$use(async (params, next) => {
  if (params.action === 'create' || params.action === 'createMany') {
    // tenant injecté via AsyncLocalStorage
    const agencyId = tenantContext.getStore()?.agencyId
    if (!agencyId) throw new Error('agencyId missing in tenant context')
    params.args.data = { ...params.args.data, agencyId }
  }
  if (['findMany', 'findFirst', 'update', 'delete', 'count'].includes(params.action)) {
    const agencyId = tenantContext.getStore()?.agencyId
    params.args.where = { ...params.args.where, agencyId }
  }
  return next(params)
})
```

## Pièges courants
- Oublier l'index sur `agency_id` → perf dégradée linéairement avec le nombre d'agences.
- `SELECT *` via Prisma par défaut — OK pour DX, mais préférer `select: { ... }` pour les rapports.
- N+1 via `include` en boucle. Utiliser `include` unique + `take/skip` ou préférer une jointure explicite.
- Migration qui lock une grosse table en prod. Utiliser `CREATE INDEX CONCURRENTLY` (via `prisma migrate` avec `Unsafe` + commande SQL brute).
- Timezones : stocker `TIMESTAMP WITHOUT TIME ZONE` par paresse. Toujours `TIMESTAMPTZ`.

## Références
- `docs/05-architecture.md §3-4`
- https://www.postgresql.org/docs/16/
- https://www.prisma.io/docs
