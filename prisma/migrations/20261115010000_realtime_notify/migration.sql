-- Real-time change notifications (Postgres LISTEN / NOTIFY). Additive only.
--
-- Every write to a business table sends one notification per statement on the
-- channel "pos_changes" with {schema, table, op}. Order status / payment changes
-- additionally send a per-row notification with the order id, so a guest's
-- order page can update. Notifications are delivered on COMMIT, and identical
-- ones within a transaction are collapsed by Postgres.

CREATE OR REPLACE FUNCTION "pos_notify_statement"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('pos_changes', json_build_object('schema', TG_TABLE_SCHEMA, 'table', TG_TABLE_NAME, 'op', TG_OP)::text);
  RETURN NULL;
END
$$;

CREATE OR REPLACE FUNCTION "pos_notify_order_row"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify(
    'pos_changes',
    json_build_object(
      'schema', TG_TABLE_SCHEMA,
      'table', TG_TABLE_NAME,
      'op', TG_OP,
      'id', NEW."id",
      'status', NEW."status",
      'paymentStatus', NEW."payment_status"
    )::text
  );
  RETURN NULL;
END
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'orders', 'ingredients', 'inventory_movements', 'menu_items', 'categories', 'menu_item_ingredients',
    'daily_prep', 'sold_out_events', 'expenses', 'floor_objects', 'store_settings'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH STATEMENT EXECUTE FUNCTION "pos_notify_statement"()',
      'pos_notify_' || t,
      t
    );
  END LOOP;
END
$$;

CREATE TRIGGER "pos_notify_order_status"
AFTER UPDATE OF "status", "payment_status" ON "orders"
FOR EACH ROW
WHEN (OLD."status" IS DISTINCT FROM NEW."status" OR OLD."payment_status" IS DISTINCT FROM NEW."payment_status")
EXECUTE FUNCTION "pos_notify_order_row"();
