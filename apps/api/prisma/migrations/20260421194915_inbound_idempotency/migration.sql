-- CreateTable
CREATE TABLE "inbound_idempotency_keys" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inbound_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbound_idempotency_keys_agencyId_expiresAt_idx" ON "inbound_idempotency_keys"("agencyId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_idempotency_keys_agencyId_idempotencyKey_key" ON "inbound_idempotency_keys"("agencyId", "idempotencyKey");
