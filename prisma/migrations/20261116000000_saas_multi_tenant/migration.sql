-- Multi-merchant (SaaS) with branches.
--
-- Shared per merchant: settings, categories, menu items + recipes, ingredient
-- catalog, running costs, floor plan, owner accounts.
-- Per branch: orders, ingredient stock, stock movements, daily prep, sold-out
-- events, menu item availability.
--
-- Existing data is kept: if the database already has POS data, one merchant
-- (named after store_settings.store_name) with a headquarters branch "hq" is
-- created and every existing row is assigned to it. Stock levels move from
-- ingredients.current_stock / low_stock_threshold to ingredient_stocks (HQ).

-- ─── New tables ────────────────────────────────────────────────────────

CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "merchants_slug_key" ON "merchants"("slug");

CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_headquarters" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "branches_merchant_id_slug_key" ON "branches"("merchant_id", "slug");
CREATE INDEX "branches_merchant_id_idx" ON "branches"("merchant_id");
ALTER TABLE "branches" ADD CONSTRAINT "branches_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- At most one headquarters per merchant.
CREATE UNIQUE INDEX "branches_one_headquarters_idx" ON "branches"("merchant_id") WHERE "is_headquarters";
ALTER TABLE "merchants" ADD CONSTRAINT "merchants_slug_format" CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$');
ALTER TABLE "branches" ADD CONSTRAINT "branches_slug_format" CHECK ("slug" ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$');

CREATE TABLE "ingredient_stocks" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "ingredient_id" TEXT NOT NULL,
    "current_stock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "low_stock_threshold" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_stocks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ingredient_stocks_branch_id_ingredient_id_key" ON "ingredient_stocks"("branch_id", "ingredient_id");
CREATE INDEX "ingredient_stocks_ingredient_id_idx" ON "ingredient_stocks"("ingredient_id");
ALTER TABLE "ingredient_stocks" ADD CONSTRAINT "ingredient_stocks_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingredient_stocks" ADD CONSTRAINT "ingredient_stocks_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ingredient_stocks" ADD CONSTRAINT "ingredient_stocks_current_stock_non_negative" CHECK ("current_stock" >= 0);
ALTER TABLE "ingredient_stocks" ADD CONSTRAINT "ingredient_stocks_low_stock_threshold_non_negative" CHECK ("low_stock_threshold" >= 0);

CREATE TABLE "branch_menu_items" (
    "id" TEXT NOT NULL,
    "branch_id" TEXT NOT NULL,
    "menu_item_id" TEXT NOT NULL,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branch_menu_items_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "branch_menu_items_branch_id_menu_item_id_key" ON "branch_menu_items"("branch_id", "menu_item_id");
CREATE INDEX "branch_menu_items_menu_item_id_idx" ON "branch_menu_items"("menu_item_id");
ALTER TABLE "branch_menu_items" ADD CONSTRAINT "branch_menu_items_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "branch_menu_items" ADD CONSTRAINT "branch_menu_items_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Tenant columns (nullable until backfilled) ────────────────────────

ALTER TABLE "admin_users"         ADD COLUMN "merchant_id" TEXT;
ALTER TABLE "store_settings"      ADD COLUMN "merchant_id" TEXT;
ALTER TABLE "categories"          ADD COLUMN "merchant_id" TEXT;
ALTER TABLE "menu_items"          ADD COLUMN "merchant_id" TEXT;
ALTER TABLE "ingredients"         ADD COLUMN "merchant_id" TEXT;
ALTER TABLE "expenses"            ADD COLUMN "merchant_id" TEXT;
ALTER TABLE "floor_objects"       ADD COLUMN "merchant_id" TEXT;
ALTER TABLE "orders"              ADD COLUMN "branch_id" TEXT;
ALTER TABLE "inventory_movements" ADD COLUMN "branch_id" TEXT;
ALTER TABLE "daily_prep"          ADD COLUMN "branch_id" TEXT;
ALTER TABLE "sold_out_events"     ADD COLUMN "branch_id" TEXT;

-- ─── Backfill existing data into one merchant + HQ branch ──────────────

DO $$
DECLARE
  has_data boolean;
  m_id text := gen_random_uuid()::text;
  b_id text := gen_random_uuid()::text;
  m_name text;
  m_slug text;
  -- TIMESTAMP(3) columns hold UTC (as Prisma writes them), whatever the session time zone.
  ts timestamp(3) := (now() AT TIME ZONE 'UTC');
BEGIN
  SELECT EXISTS (SELECT 1 FROM "store_settings") OR EXISTS (SELECT 1 FROM "admin_users")
      OR EXISTS (SELECT 1 FROM "categories") OR EXISTS (SELECT 1 FROM "ingredients")
      OR EXISTS (SELECT 1 FROM "orders") OR EXISTS (SELECT 1 FROM "expenses")
      OR EXISTS (SELECT 1 FROM "floor_objects")
    INTO has_data;
  IF NOT has_data THEN
    RETURN;
  END IF;

  SELECT "store_name" INTO m_name FROM "store_settings" ORDER BY "id" LIMIT 1;
  m_name := COALESCE(NULLIF(trim(m_name), ''), 'My Café');
  m_slug := trim(BOTH '-' FROM regexp_replace(lower(m_name), '[^a-z0-9]+', '-', 'g'));
  m_slug := left(trim(BOTH '-' FROM m_slug), 40);
  IF m_slug = '' THEN m_slug := 'my-cafe'; END IF;

  INSERT INTO "merchants" ("id", "slug", "name", "created_at", "updated_at") VALUES (m_id, m_slug, m_name, ts, ts);
  INSERT INTO "branches" ("id", "merchant_id", "slug", "name", "is_headquarters", "created_at", "updated_at")
    VALUES (b_id, m_id, 'hq', 'Headquarters', true, ts, ts);

  UPDATE "admin_users"         SET "merchant_id" = m_id;
  UPDATE "store_settings"      SET "merchant_id" = m_id;
  UPDATE "categories"          SET "merchant_id" = m_id;
  UPDATE "menu_items"          SET "merchant_id" = m_id;
  UPDATE "ingredients"         SET "merchant_id" = m_id;
  UPDATE "expenses"            SET "merchant_id" = m_id;
  UPDATE "floor_objects"       SET "merchant_id" = m_id;
  UPDATE "orders"              SET "branch_id" = b_id;
  UPDATE "inventory_movements" SET "branch_id" = b_id;
  UPDATE "daily_prep"          SET "branch_id" = b_id;
  UPDATE "sold_out_events"     SET "branch_id" = b_id;

  INSERT INTO "ingredient_stocks" ("id", "branch_id", "ingredient_id", "current_stock", "low_stock_threshold", "updated_at")
    SELECT gen_random_uuid()::text, b_id, "id", "current_stock", "low_stock_threshold", ts FROM "ingredients";

  -- Items switched off before stay off at HQ.
  INSERT INTO "branch_menu_items" ("id", "branch_id", "menu_item_id", "is_available", "updated_at")
    SELECT gen_random_uuid()::text, b_id, "id", false, ts FROM "menu_items" WHERE NOT "is_available";
  -- menu_items.is_available is now the "on the menu at all branches" switch.
  UPDATE "menu_items" SET "is_available" = true WHERE NOT "is_available";
END
$$;

-- ─── Constraints ───────────────────────────────────────────────────────

ALTER TABLE "admin_users"         ALTER COLUMN "merchant_id" SET NOT NULL;
ALTER TABLE "store_settings"      ALTER COLUMN "merchant_id" SET NOT NULL;
ALTER TABLE "categories"          ALTER COLUMN "merchant_id" SET NOT NULL;
ALTER TABLE "menu_items"          ALTER COLUMN "merchant_id" SET NOT NULL;
ALTER TABLE "ingredients"         ALTER COLUMN "merchant_id" SET NOT NULL;
ALTER TABLE "expenses"            ALTER COLUMN "merchant_id" SET NOT NULL;
ALTER TABLE "floor_objects"       ALTER COLUMN "merchant_id" SET NOT NULL;
ALTER TABLE "orders"              ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "inventory_movements" ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "daily_prep"          ALTER COLUMN "branch_id" SET NOT NULL;
ALTER TABLE "sold_out_events"     ALTER COLUMN "branch_id" SET NOT NULL;

ALTER TABLE "admin_users"         ADD CONSTRAINT "admin_users_merchant_id_fkey"         FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "store_settings"      ADD CONSTRAINT "store_settings_merchant_id_fkey"      FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "categories"          ADD CONSTRAINT "categories_merchant_id_fkey"          FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "menu_items"          ADD CONSTRAINT "menu_items_merchant_id_fkey"          FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ingredients"         ADD CONSTRAINT "ingredients_merchant_id_fkey"         FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses"            ADD CONSTRAINT "expenses_merchant_id_fkey"            FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "floor_objects"       ADD CONSTRAINT "floor_objects_merchant_id_fkey"       FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "orders"              ADD CONSTRAINT "orders_branch_id_fkey"                FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_branch_id_fkey"   FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "daily_prep"          ADD CONSTRAINT "daily_prep_branch_id_fkey"            FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sold_out_events"     ADD CONSTRAINT "sold_out_events_branch_id_fkey"       FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Unique names / SKUs / table numbers are now per merchant.
DROP INDEX "categories_name_key";
DROP INDEX "ingredients_name_key";
DROP INDEX "ingredients_sku_key";
DROP INDEX "floor_objects_table_number_key";
DROP INDEX "daily_prep_date_menu_item_id_key";
CREATE UNIQUE INDEX "categories_merchant_id_name_key" ON "categories"("merchant_id", "name");
CREATE UNIQUE INDEX "ingredients_merchant_id_name_key" ON "ingredients"("merchant_id", "name");
CREATE UNIQUE INDEX "ingredients_merchant_id_sku_key" ON "ingredients"("merchant_id", "sku");
CREATE UNIQUE INDEX "floor_objects_merchant_id_table_number_key" ON "floor_objects"("merchant_id", "table_number");
CREATE UNIQUE INDEX "daily_prep_branch_id_date_menu_item_id_key" ON "daily_prep"("branch_id", "date", "menu_item_id");

CREATE INDEX "admin_users_merchant_id_idx" ON "admin_users"("merchant_id");
CREATE INDEX "menu_items_merchant_id_idx" ON "menu_items"("merchant_id");
CREATE INDEX "expenses_merchant_id_idx" ON "expenses"("merchant_id");
CREATE INDEX "floor_objects_merchant_id_idx" ON "floor_objects"("merchant_id");
CREATE INDEX "orders_branch_id_created_at_idx" ON "orders"("branch_id", "created_at");
CREATE INDEX "orders_branch_id_status_idx" ON "orders"("branch_id", "status");
CREATE INDEX "inventory_movements_branch_id_created_at_idx" ON "inventory_movements"("branch_id", "created_at");
CREATE INDEX "sold_out_events_branch_id_sold_out_at_idx" ON "sold_out_events"("branch_id", "sold_out_at");

-- Settings: one row per merchant instead of the id = 1 singleton.
ALTER TABLE "store_settings" DROP CONSTRAINT "store_settings_singleton";
CREATE SEQUENCE "store_settings_id_seq" OWNED BY "store_settings"."id";
SELECT setval('"store_settings_id_seq"', COALESCE((SELECT MAX("id") FROM "store_settings"), 0) + 1, false);
ALTER TABLE "store_settings" ALTER COLUMN "id" SET DEFAULT nextval('"store_settings_id_seq"');
CREATE UNIQUE INDEX "store_settings_merchant_id_key" ON "store_settings"("merchant_id");

-- Stock now lives per branch in ingredient_stocks.
ALTER TABLE "ingredients" DROP COLUMN "current_stock";
ALTER TABLE "ingredients" DROP COLUMN "low_stock_threshold";

-- ─── Real-time notifications, now tagged with merchant / branch ────────
-- One notification per statement and distinct (merchant, branch) of the rows
-- touched: {schema, table, op, m, b}. Statement-level with transition tables
-- keeps bulk inserts (history generator) cheap.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orders', 'ingredients', 'inventory_movements', 'menu_items', 'categories', 'menu_item_ingredients',
    'daily_prep', 'sold_out_events', 'expenses', 'floor_objects', 'store_settings'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', 'pos_notify_' || t, t);
  END LOOP;
END
$$;
DROP FUNCTION IF EXISTS "pos_notify_statement"();

CREATE OR REPLACE FUNCTION "pos_notify_new_rows"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT j->>'merchant_id' AS m, j->>'branch_id' AS b FROM (SELECT to_jsonb(x) AS j FROM new_rows x) s LOOP
    PERFORM pg_notify('pos_changes', json_build_object('schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME, 'op', TG_OP, 'm', r.m, 'b', r.b)::text);
  END LOOP;
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION "pos_notify_old_rows"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT DISTINCT j->>'merchant_id' AS m, j->>'branch_id' AS b FROM (SELECT to_jsonb(x) AS j FROM old_rows x) s LOOP
    PERFORM pg_notify('pos_changes', json_build_object('schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME, 'op', TG_OP, 'm', r.m, 'b', r.b)::text);
  END LOOP;
  RETURN NULL;
END
$$;

-- Tables without tenant columns (recipes) notify without m / b: delivered to everyone.
CREATE OR REPLACE FUNCTION "pos_notify_statement"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('pos_changes', json_build_object('schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME, 'op', TG_OP)::text);
  RETURN NULL;
END
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orders', 'ingredients', 'ingredient_stocks', 'inventory_movements', 'menu_items', 'categories',
    'branch_menu_items', 'daily_prep', 'sold_out_events', 'expenses', 'floor_objects', 'store_settings',
    'branches', 'merchants'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I AFTER INSERT ON %I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION "pos_notify_new_rows"()', 'pos_notify_ins_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER UPDATE ON %I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION "pos_notify_new_rows"()', 'pos_notify_upd_' || t, t);
    EXECUTE format('CREATE TRIGGER %I AFTER DELETE ON %I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION "pos_notify_old_rows"()', 'pos_notify_del_' || t, t);
  END LOOP;
END
$$;
CREATE TRIGGER "pos_notify_menu_item_ingredients" AFTER INSERT OR UPDATE OR DELETE ON "menu_item_ingredients" FOR EACH STATEMENT EXECUTE FUNCTION "pos_notify_statement"();

-- Per-row order status notification (guest order page) now carries the branch.
CREATE OR REPLACE FUNCTION "pos_notify_order_row"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'pos_changes',
    json_build_object(
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME,
      'op', TG_OP,
      'b', NEW."branch_id",
      'id', NEW."id",
      'status', NEW."status",
      'paymentStatus', NEW."payment_status"
    )::text
  );
  RETURN NULL;
END
$$;

-- ─── Row Level Security (see 20261113000100_enable_rls) ────────────────

ALTER TABLE "merchants"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branches"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingredient_stocks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "branch_menu_items" ENABLE ROW LEVEL SECURITY;
