-- Operating expenses (rent, utilities, salaries, …). Additive only.

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'UTILITIES', 'STAFF', 'EQUIPMENT', 'MAINTENANCE', 'MARKETING', 'LICENSES', 'OTHER');

-- CreateEnum
CREATE TYPE "ExpenseFrequency" AS ENUM ('ONE_TIME', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "frequency" "ExpenseFrequency" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "notes" TEXT NOT NULL DEFAULT '',
    "is_simulated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_category_idx" ON "expenses"("category");

-- CreateIndex
CREATE INDEX "expenses_start_date_end_date_idx" ON "expenses"("start_date", "end_date");

-- Integrity rules (hand-written)
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_end_after_start" CHECK ("end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_one_time_single_day" CHECK ("frequency" <> 'ONE_TIME' OR "end_date" IS NULL OR "end_date" = "start_date");

-- Closed to Supabase's public Data API, like every other POS table.
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
