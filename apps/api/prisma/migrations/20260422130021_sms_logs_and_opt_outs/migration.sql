-- CreateEnum
CREATE TYPE "SmsProvider" AS ENUM ('SWISSCOM', 'TWILIO', 'NOOP');

-- CreateEnum
CREATE TYPE "SmsStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'OPT_OUT');

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "toMasked" TEXT NOT NULL,
    "templateCode" TEXT NOT NULL,
    "provider" "SmsProvider" NOT NULL,
    "providerMessageId" TEXT,
    "status" "SmsStatus" NOT NULL DEFAULT 'QUEUED',
    "sentAt" TIMESTAMPTZ(6),
    "deliveredAt" TIMESTAMPTZ(6),
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_opt_outs" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "phoneE164" TEXT NOT NULL,
    "optedOutAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_logs_agencyId_createdAt_idx" ON "sms_logs"("agencyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "sms_logs_provider_providerMessageId_key" ON "sms_logs"("provider", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "sms_opt_outs_agencyId_phoneE164_key" ON "sms_opt_outs"("agencyId", "phoneE164");
