-- CreateTable
CREATE TABLE "canton_holidays" (
    "canton" CHAR(2) NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "scope" VARCHAR(16) NOT NULL,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "canton_holidays_pkey" PRIMARY KEY ("canton","date","validFrom")
);

-- CreateIndex
CREATE INDEX "canton_holidays_canton_date_idx" ON "canton_holidays"("canton", "date");
