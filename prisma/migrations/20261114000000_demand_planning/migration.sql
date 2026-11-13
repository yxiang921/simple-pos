-- Demand-planning data for BossBuddy (read-only consumer). Additive only:
-- no existing table or column is renamed or removed.

-- AlterTable: ingredient cost (RM per one base unit: per g / ml / pcs)
ALTER TABLE "ingredients" ADD COLUMN "cost_per_unit" DECIMAL(14,6);

-- AlterTable: menu item planning attributes
ALTER TABLE "menu_items" ADD COLUMN "is_prepared_ahead" BOOLEAN,
ADD COLUMN "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable: store hours
ALTER TABLE "store_settings" ADD COLUMN "open_time" TEXT,
ADD COLUMN "close_time" TEXT,
ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur';

-- AlterTable: mark generated demo history
ALTER TABLE "orders" ADD COLUMN "is_simulated" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "daily_prep" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "plates_prepared" INTEGER NOT NULL,
    "is_simulated" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_prep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sold_out_events" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "sold_out_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_simulated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sold_out_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "orders_is_simulated_created_at_idx" ON "orders"("is_simulated", "created_at");

-- CreateIndex
CREATE INDEX "daily_prep_menu_item_id_idx" ON "daily_prep"("menu_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "daily_prep_date_menu_item_id_key" ON "daily_prep"("date", "menu_item_id");

-- CreateIndex
CREATE INDEX "sold_out_events_menu_item_id_sold_out_at_idx" ON "sold_out_events"("menu_item_id", "sold_out_at");

-- CreateIndex
CREATE INDEX "sold_out_events_sold_out_at_idx" ON "sold_out_events"("sold_out_at");

-- AddForeignKey
ALTER TABLE "daily_prep" ADD CONSTRAINT "daily_prep_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sold_out_events" ADD CONSTRAINT "sold_out_events_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Integrity rules (hand-written) ──────────────────────────────────────
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_cost_per_unit_non_negative" CHECK ("cost_per_unit" IS NULL OR "cost_per_unit" >= 0);
ALTER TABLE "daily_prep" ADD CONSTRAINT "daily_prep_plates_non_negative" CHECK ("plates_prepared" >= 0);
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_open_time_format" CHECK ("open_time" IS NULL OR "open_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_close_time_format" CHECK ("close_time" IS NULL OR "close_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Keep the new tables closed to Supabase's public Data API, like the others.
ALTER TABLE "daily_prep"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sold_out_events" ENABLE ROW LEVEL SECURITY;
