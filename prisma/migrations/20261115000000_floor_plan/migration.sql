-- Floor plan for the 3D floor view. Additive only.

-- CreateEnum
CREATE TYPE "FloorObjectKind" AS ENUM ('TABLE', 'COUNTER', 'PASS', 'KITCHEN', 'ENTRANCE', 'BAR', 'WALL', 'PLANT');

-- CreateEnum
CREATE TYPE "FloorShape" AS ENUM ('RECT', 'ROUND');

-- AlterTable
ALTER TABLE "store_settings" ADD COLUMN "floor_width" DOUBLE PRECISION NOT NULL DEFAULT 14,
ADD COLUMN "floor_depth" DOUBLE PRECISION NOT NULL DEFAULT 10,
ADD COLUMN "order_alert_minutes" INTEGER NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "floor_objects" (
    "id" TEXT NOT NULL,
    "kind" "FloorObjectKind" NOT NULL,
    "label" TEXT NOT NULL,
    "table_number" TEXT,
    "seats" INTEGER,
    "shape" "FloorShape" NOT NULL DEFAULT 'RECT',
    "x" DOUBLE PRECISION NOT NULL,
    "z" DOUBLE PRECISION NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "depth" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "floor_objects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "floor_objects_table_number_key" ON "floor_objects"("table_number");

-- Integrity rules (hand-written)
ALTER TABLE "floor_objects" ADD CONSTRAINT "floor_objects_table_needs_number" CHECK ("kind" <> 'TABLE' OR "table_number" IS NOT NULL);
ALTER TABLE "floor_objects" ADD CONSTRAINT "floor_objects_seats_range" CHECK ("seats" IS NULL OR ("seats" BETWEEN 1 AND 30));
ALTER TABLE "floor_objects" ADD CONSTRAINT "floor_objects_size_positive" CHECK ("width" > 0 AND "depth" > 0);
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_floor_size_range" CHECK ("floor_width" BETWEEN 3 AND 100 AND "floor_depth" BETWEEN 3 AND 100);
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_alert_minutes_range" CHECK ("order_alert_minutes" BETWEEN 1 AND 240);

-- Closed to Supabase's public Data API, like every other POS table.
ALTER TABLE "floor_objects" ENABLE ROW LEVEL SECURITY;
