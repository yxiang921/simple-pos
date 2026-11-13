-- CreateEnum
CREATE TYPE "BaseUnit" AS ENUM ('PCS', 'G', 'ML');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('INITIAL', 'RESTOCK', 'ORDER_DEDUCTION', 'ORDER_CANCELLATION', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Administrator',
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "store_name" TEXT NOT NULL DEFAULT 'Kopi & Co.',
    "accepting_orders" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(10,2) NOT NULL,
    "image_url" TEXT,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "is_archived" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "unit" "BaseUnit" NOT NULL,
    "current_stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "low_stock_threshold" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_ingredients" (
    "id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "quantity_required" DECIMAL(12,3) NOT NULL,

    CONSTRAINT "menu_item_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "order_number" SERIAL NOT NULL,
    "customer_name" TEXT NOT NULL,
    "table_number" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "total_amount" DECIMAL(10,2) NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "cancel_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "stock_restored_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "menu_item_name_snapshot" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_snapshot" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_ingredients" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "ingredient_name_snapshot" TEXT NOT NULL,
    "unit_snapshot" "BaseUnit" NOT NULL,
    "quantity_deducted" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "order_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "order_id" TEXT,
    "movement_type" "MovementType" NOT NULL,
    "quantity_change" DECIMAL(14,3) NOT NULL,
    "balance_after" DECIMAL(14,3) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_user_id_idx" ON "admin_sessions"("admin_user_id");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE INDEX "categories_sort_order_idx" ON "categories"("sort_order");

-- CreateIndex
CREATE INDEX "menu_items_category_id_idx" ON "menu_items"("category_id");

-- CreateIndex
CREATE INDEX "menu_items_is_archived_is_available_idx" ON "menu_items"("is_archived", "is_available");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_name_key" ON "ingredients"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_sku_key" ON "ingredients"("sku");

-- CreateIndex
CREATE INDEX "ingredients_is_active_idx" ON "ingredients"("is_active");

-- CreateIndex
CREATE INDEX "menu_item_ingredients_ingredient_id_idx" ON "menu_item_ingredients"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_ingredients_menu_item_id_ingredient_id_key" ON "menu_item_ingredients"("menu_item_id", "ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotency_key_key" ON "orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_menu_item_id_idx" ON "order_items"("menu_item_id");

-- CreateIndex
CREATE INDEX "order_ingredients_ingredient_id_idx" ON "order_ingredients"("ingredient_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_ingredients_order_id_ingredient_id_key" ON "order_ingredients"("order_id", "ingredient_id");

-- CreateIndex
CREATE INDEX "inventory_movements_ingredient_id_created_at_idx" ON "inventory_movements"("ingredient_id", "created_at");

-- CreateIndex
CREATE INDEX "inventory_movements_order_id_idx" ON "inventory_movements"("order_id");

-- CreateIndex
CREATE INDEX "inventory_movements_movement_type_idx" ON "inventory_movements"("movement_type");

-- CreateIndex
CREATE INDEX "inventory_movements_created_at_idx" ON "inventory_movements"("created_at");

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_ingredients" ADD CONSTRAINT "order_ingredients_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_ingredients" ADD CONSTRAINT "order_ingredients_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────
-- Integrity rules not expressible in the Prisma schema (hand-written)
-- ─────────────────────────────────────────────────────────────────────────

-- Stock can never become negative, even if application code has a bug.
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_current_stock_non_negative" CHECK ("current_stock" >= 0);
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_low_stock_threshold_non_negative" CHECK ("low_stock_threshold" >= 0);

-- Prices, quantities and totals must be sane.
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_price_non_negative" CHECK ("price" >= 0);
ALTER TABLE "menu_item_ingredients" ADD CONSTRAINT "menu_item_ingredients_quantity_positive" CHECK ("quantity_required" > 0);
ALTER TABLE "orders" ADD CONSTRAINT "orders_total_non_negative" CHECK ("total_amount" >= 0);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_quantity_positive" CHECK ("quantity" > 0);
ALTER TABLE "order_ingredients" ADD CONSTRAINT "order_ingredients_quantity_positive" CHECK ("quantity_deducted" > 0);
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_change_non_zero" CHECK ("quantity_change" <> 0);
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_balance_non_negative" CHECK ("balance_after" >= 0);

-- Order-linked movements: an order can deduct an ingredient at most once and
-- restore it at most once. Guarantees no double deduction / double restore.
CREATE UNIQUE INDEX "inventory_movements_order_once_idx"
  ON "inventory_movements"("order_id", "ingredient_id", "movement_type")
  WHERE "order_id" IS NOT NULL;

-- Order-linked movement types must reference an order.
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_order_required"
  CHECK ("movement_type" NOT IN ('ORDER_DEDUCTION', 'ORDER_CANCELLATION') OR "order_id" IS NOT NULL);

-- Store settings is a singleton.
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_singleton" CHECK ("id" = 1);
