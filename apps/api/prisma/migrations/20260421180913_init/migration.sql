-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('TEMP_WORKER', 'FIXED_TERM');

-- CreateEnum
CREATE TYPE "WorkerDocumentType" AS ENUM ('WORK_PERMIT', 'AVS_CARD', 'LAMAL_ATTESTATION', 'ID_CARD', 'CV', 'DIPLOMA', 'CERTIFICATION', 'OTHER');

-- CreateEnum
CREATE TYPE "WorkerDocumentStatus" AS ENUM ('VALID', 'EXPIRING_SOON', 'EXPIRED', 'MISSING');

-- CreateEnum
CREATE TYPE "DrivingLicenseCategory" AS ENUM ('B', 'C1', 'C', 'CE', 'D');

-- CreateEnum
CREATE TYPE "AvailabilitySource" AS ENUM ('WORKER_PORTAL', 'AGENCY_ADMIN', 'MOVEPLANNER_PUSH');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'TENTATIVE');

-- CreateEnum
CREATE TYPE "MissionProposalStatus" AS ENUM ('PROPOSED', 'PASS_THROUGH_SENT', 'AGENCY_REVIEW', 'ACCEPTED', 'REFUSED', 'TIMEOUT', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MissionProposalRoutingMode" AS ENUM ('PASS_THROUGH', 'AGENCY_CONTROLLED');

-- CreateEnum
CREATE TYPE "MissionContractStatus" AS ENUM ('DRAFT', 'SENT_FOR_SIGNATURE', 'SIGNED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TimesheetStatus" AS ENUM ('RECEIVED', 'UNDER_REVIEW', 'SIGNED', 'DISPUTED', 'TACIT_APPROVED');

-- CreateEnum
CREATE TYPE "PayslipStatus" AS ENUM ('DRAFT', 'FINALIZED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'PAID', 'OVERDUE', 'DISPUTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SIGN', 'APPROVE', 'REJECT', 'EMIT', 'RECEIVE');

-- CreateEnum
CREATE TYPE "LseAuthorizationStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "InboundWebhookStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'SKIPPED_DUPLICATE');

-- CreateEnum
CREATE TYPE "OutboundIdempotencyStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "agencies" (
    "id" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "ideNumber" TEXT NOT NULL,
    "canton" CHAR(2) NOT NULL,
    "iban" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lse_authorizations" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "canton" CHAR(2) NOT NULL,
    "authorityName" TEXT NOT NULL,
    "authNumber" TEXT NOT NULL,
    "status" "LseAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
    "grantedAt" TIMESTAMPTZ(6),
    "expiresAt" TIMESTAMPTZ(6),
    "bondAmountRappen" BIGINT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lse_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "temp_workers" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" DATE,
    "avs" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "residenceCanton" CHAR(2) NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "zipCode" TEXT,
    "city" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'TEMP_WORKER',
    "reliabilityScore" INTEGER,
    "notes" TEXT,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "temp_workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_documents" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "type" "WorkerDocumentType" NOT NULL,
    "status" "WorkerDocumentStatus" NOT NULL DEFAULT 'VALID',
    "fileKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "issuedAt" DATE,
    "expiresAt" DATE,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "worker_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_qualifications" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "specialty" TEXT,
    "issuedAt" DATE,
    "expiresAt" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "worker_qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_driving_licenses" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "category" "DrivingLicenseCategory" NOT NULL,
    "issuedAt" DATE NOT NULL,
    "expiresAt" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "worker_driving_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "legalName" TEXT NOT NULL,
    "ideNumber" TEXT,
    "billingEmail" TEXT,
    "contactPhone" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "zipCode" TEXT,
    "city" TEXT,
    "canton" CHAR(2),
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 30,
    "creditLimitRappen" BIGINT,
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_contracts" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "agencyCoefficient" INTEGER NOT NULL,
    "billingFrequencyDays" INTEGER NOT NULL DEFAULT 30,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "client_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_cards" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "clientContractId" UUID,
    "role" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "hourlyRateRappen" BIGINT NOT NULL,
    "agencyCoefficient" INTEGER NOT NULL,
    "nightPremiumBp" INTEGER NOT NULL DEFAULT 2500,
    "sundayPremiumBp" INTEGER NOT NULL DEFAULT 5000,
    "overtimePremiumBp" INTEGER NOT NULL DEFAULT 2500,
    "validFrom" DATE NOT NULL,
    "validUntil" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "rate_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "worker_availabilities" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "status" "AvailabilityStatus" NOT NULL,
    "source" "AvailabilitySource" NOT NULL,
    "rrule" TEXT,
    "reason" TEXT,
    "ttlUntil" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "worker_availabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_proposals" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "workerId" UUID,
    "clientId" UUID,
    "externalRequestId" TEXT NOT NULL,
    "status" "MissionProposalStatus" NOT NULL DEFAULT 'PROPOSED',
    "routingMode" "MissionProposalRoutingMode" NOT NULL,
    "proposedAt" TIMESTAMPTZ(6) NOT NULL,
    "responseDeadline" TIMESTAMPTZ(6),
    "acceptedAt" TIMESTAMPTZ(6),
    "refusedAt" TIMESTAMPTZ(6),
    "rawPayload" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mission_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_contracts" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "branch" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "status" "MissionContractStatus" NOT NULL DEFAULT 'DRAFT',
    "signedAt" TIMESTAMPTZ(6),
    "signedPdfKey" TEXT,
    "zertesEnvelopeId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mission_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheets" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "externalTimesheetId" TEXT,
    "weekIso" TEXT NOT NULL,
    "plannedMinutes" INTEGER NOT NULL DEFAULT 0,
    "declaredMinutes" INTEGER NOT NULL DEFAULT 0,
    "status" "TimesheetStatus" NOT NULL DEFAULT 'RECEIVED',
    "receivedAt" TIMESTAMPTZ(6) NOT NULL,
    "signedAt" TIMESTAMPTZ(6),
    "disputedAt" TIMESTAMPTZ(6),
    "disputeReason" TEXT,
    "entries" JSONB NOT NULL,
    "anomalies" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "timesheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "timesheetId" UUID,
    "weekIso" TEXT NOT NULL,
    "grossSalaryRappen" BIGINT NOT NULL,
    "netSalaryRappen" BIGINT NOT NULL,
    "employerCostRappen" BIGINT NOT NULL,
    "socialDeductions" JSONB NOT NULL,
    "status" "PayslipStatus" NOT NULL DEFAULT 'DRAFT',
    "pdfKey" TEXT,
    "elmExchangeId" TEXT,
    "iso20022MessageId" TEXT,
    "paidAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "subTotalRappen" BIGINT NOT NULL,
    "vatBasisPoints" INTEGER NOT NULL DEFAULT 810,
    "vatAmountRappen" BIGINT NOT NULL,
    "totalAmountRappen" BIGINT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "dueAt" DATE,
    "issuedAt" TIMESTAMPTZ(6),
    "paidAt" TIMESTAMPTZ(6),
    "pdfKey" TEXT,
    "qrBillReference" TEXT,
    "lines" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbound_webhook_events" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMPTZ(6),
    "status" "InboundWebhookStatus" NOT NULL DEFAULT 'PENDING',
    "payload" JSONB NOT NULL,
    "headers" JSONB NOT NULL,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "inbound_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_idempotency_keys" (
    "id" UUID NOT NULL,
    "agencyId" UUID NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "status" "OutboundIdempotencyStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "firstAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAttemptAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbound_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agencies_ideNumber_key" ON "agencies"("ideNumber");

-- CreateIndex
CREATE INDEX "lse_authorizations_agencyId_status_idx" ON "lse_authorizations"("agencyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lse_authorizations_agencyId_canton_key" ON "lse_authorizations"("agencyId", "canton");

-- CreateIndex
CREATE INDEX "temp_workers_agencyId_archivedAt_idx" ON "temp_workers"("agencyId", "archivedAt");

-- CreateIndex
CREATE INDEX "temp_workers_agencyId_lastName_firstName_idx" ON "temp_workers"("agencyId", "lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "temp_workers_agencyId_avs_key" ON "temp_workers"("agencyId", "avs");

-- CreateIndex
CREATE INDEX "worker_documents_agencyId_workerId_type_idx" ON "worker_documents"("agencyId", "workerId", "type");

-- CreateIndex
CREATE INDEX "worker_documents_agencyId_expiresAt_idx" ON "worker_documents"("agencyId", "expiresAt");

-- CreateIndex
CREATE INDEX "worker_qualifications_agencyId_workerId_idx" ON "worker_qualifications"("agencyId", "workerId");

-- CreateIndex
CREATE INDEX "worker_driving_licenses_agencyId_workerId_idx" ON "worker_driving_licenses"("agencyId", "workerId");

-- CreateIndex
CREATE UNIQUE INDEX "worker_driving_licenses_workerId_category_key" ON "worker_driving_licenses"("workerId", "category");

-- CreateIndex
CREATE INDEX "clients_agencyId_archivedAt_idx" ON "clients"("agencyId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "clients_agencyId_ideNumber_key" ON "clients"("agencyId", "ideNumber");

-- CreateIndex
CREATE INDEX "client_contracts_agencyId_clientId_idx" ON "client_contracts"("agencyId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "client_contracts_agencyId_reference_key" ON "client_contracts"("agencyId", "reference");

-- CreateIndex
CREATE INDEX "rate_cards_agencyId_clientId_role_idx" ON "rate_cards"("agencyId", "clientId", "role");

-- CreateIndex
CREATE INDEX "rate_cards_agencyId_validFrom_validUntil_idx" ON "rate_cards"("agencyId", "validFrom", "validUntil");

-- CreateIndex
CREATE INDEX "worker_availabilities_agencyId_workerId_startsAt_idx" ON "worker_availabilities"("agencyId", "workerId", "startsAt");

-- CreateIndex
CREATE INDEX "worker_availabilities_agencyId_status_startsAt_idx" ON "worker_availabilities"("agencyId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "mission_proposals_agencyId_status_proposedAt_idx" ON "mission_proposals"("agencyId", "status", "proposedAt");

-- CreateIndex
CREATE INDEX "mission_proposals_agencyId_workerId_idx" ON "mission_proposals"("agencyId", "workerId");

-- CreateIndex
CREATE UNIQUE INDEX "mission_proposals_agencyId_externalRequestId_key" ON "mission_proposals"("agencyId", "externalRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "mission_contracts_proposalId_key" ON "mission_contracts"("proposalId");

-- CreateIndex
CREATE INDEX "mission_contracts_agencyId_workerId_signedAt_idx" ON "mission_contracts"("agencyId", "workerId", "signedAt");

-- CreateIndex
CREATE UNIQUE INDEX "mission_contracts_agencyId_reference_key" ON "mission_contracts"("agencyId", "reference");

-- CreateIndex
CREATE INDEX "timesheets_agencyId_workerId_weekIso_idx" ON "timesheets"("agencyId", "workerId", "weekIso");

-- CreateIndex
CREATE INDEX "timesheets_agencyId_status_receivedAt_idx" ON "timesheets"("agencyId", "status", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "timesheets_agencyId_externalTimesheetId_key" ON "timesheets"("agencyId", "externalTimesheetId");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_timesheetId_key" ON "payslips"("timesheetId");

-- CreateIndex
CREATE INDEX "payslips_agencyId_workerId_weekIso_idx" ON "payslips"("agencyId", "workerId", "weekIso");

-- CreateIndex
CREATE INDEX "payslips_agencyId_status_paidAt_idx" ON "payslips"("agencyId", "status", "paidAt");

-- CreateIndex
CREATE INDEX "invoices_agencyId_clientId_periodStart_idx" ON "invoices"("agencyId", "clientId", "periodStart");

-- CreateIndex
CREATE INDEX "invoices_agencyId_status_dueAt_idx" ON "invoices"("agencyId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_agencyId_reference_key" ON "invoices"("agencyId", "reference");

-- CreateIndex
CREATE INDEX "audit_logs_agencyId_entityType_entityId_idx" ON "audit_logs"("agencyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_agencyId_occurredAt_idx" ON "audit_logs"("agencyId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_logs_agencyId_actorId_occurredAt_idx" ON "audit_logs"("agencyId", "actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "inbound_webhook_events_agencyId_status_receivedAt_idx" ON "inbound_webhook_events"("agencyId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "inbound_webhook_events_agencyId_eventType_receivedAt_idx" ON "inbound_webhook_events"("agencyId", "eventType", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "inbound_webhook_events_eventId_key" ON "inbound_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "outbound_idempotency_keys_agencyId_endpoint_status_idx" ON "outbound_idempotency_keys"("agencyId", "endpoint", "status");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_idempotency_keys_idempotencyKey_key" ON "outbound_idempotency_keys"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "lse_authorizations" ADD CONSTRAINT "lse_authorizations_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "temp_workers" ADD CONSTRAINT "temp_workers_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_documents" ADD CONSTRAINT "worker_documents_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "temp_workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_qualifications" ADD CONSTRAINT "worker_qualifications_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "temp_workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_driving_licenses" ADD CONSTRAINT "worker_driving_licenses_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "temp_workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_contracts" ADD CONSTRAINT "client_contracts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_clientContractId_fkey" FOREIGN KEY ("clientContractId") REFERENCES "client_contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "worker_availabilities" ADD CONSTRAINT "worker_availabilities_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "temp_workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_proposals" ADD CONSTRAINT "mission_proposals_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_proposals" ADD CONSTRAINT "mission_proposals_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "temp_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_proposals" ADD CONSTRAINT "mission_proposals_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_contracts" ADD CONSTRAINT "mission_contracts_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_contracts" ADD CONSTRAINT "mission_contracts_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "temp_workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_contracts" ADD CONSTRAINT "mission_contracts_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "mission_proposals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheets" ADD CONSTRAINT "timesheets_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "temp_workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "temp_workers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_timesheetId_fkey" FOREIGN KEY ("timesheetId") REFERENCES "timesheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "agencies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
