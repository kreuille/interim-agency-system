-- CreateEnum
CREATE TYPE "AvailabilityOutboxStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED', 'DEAD');

-- CreateTable
CREATE TABLE "outbox_availability_push" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AvailabilityOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMPTZ(6),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "outbox_availability_push_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_availability_snapshots" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "slots" JSONB NOT NULL,
    "lastUpdatedAt" TIMESTAMPTZ(6) NOT NULL,
    "ttlExpiresAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "worker_availability_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_availability_push_idempotencyKey_key" ON "outbox_availability_push"("idempotencyKey");

-- CreateIndex
CREATE INDEX "outbox_availability_push_status_nextAttemptAt_idx" ON "outbox_availability_push"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "outbox_availability_push_agencyId_workerId_status_idx" ON "outbox_availability_push"("agencyId", "workerId", "status");

-- CreateIndex
CREATE INDEX "worker_availability_snapshots_agencyId_ttlExpiresAt_idx" ON "worker_availability_snapshots"("agencyId", "ttlExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "worker_availability_snapshots_agencyId_workerId_key" ON "worker_availability_snapshots"("agencyId", "workerId");
