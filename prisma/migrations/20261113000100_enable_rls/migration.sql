-- Supabase exposes the `public` schema through its Data API (PostgREST) to the
-- `anon` / `authenticated` roles. This app never uses that API — it connects via
-- Prisma as the table owner, which bypasses RLS. Enabling RLS with no policies
-- therefore blocks Data API access while leaving the app unaffected.
-- On plain PostgreSQL this is harmless.

ALTER TABLE "admin_users"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_sessions"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "store_settings"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_items"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ingredients"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_item_ingredients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "orders"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_items"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "order_ingredients"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inventory_movements"   ENABLE ROW LEVEL SECURITY;
