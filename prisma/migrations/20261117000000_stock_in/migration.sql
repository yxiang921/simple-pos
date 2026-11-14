-- Stock in: deliveries received at a branch. Additive only.
-- Each delivery is a stock_receipts row; its lines are RESTOCK
-- inventory_movements pointing at it (receipt_id), with an optional line cost.

CREATE TABLE "stock_receipts" (
    "id" TEXT NOT NULL,
    "receipt_number" SERIAL NOT NULL,
    "branch_id" TEXT NOT NULL,
    "supplier" TEXT NOT NULL DEFAULT '',
    "reference" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_cost" DECIMAL(12,2),
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_receipts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "stock_receipts_receipt_number_key" ON "stock_receipts"("receipt_number");
CREATE INDEX "stock_receipts_branch_id_received_at_idx" ON "stock_receipts"("branch_id", "received_at");
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_branch_id_fkey" FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "stock_receipts" ADD CONSTRAINT "stock_receipts_total_cost_non_negative" CHECK ("total_cost" IS NULL OR "total_cost" >= 0);

ALTER TABLE "inventory_movements" ADD COLUMN "receipt_id" TEXT;
ALTER TABLE "inventory_movements" ADD COLUMN "line_cost" DECIMAL(12,2);
CREATE INDEX "inventory_movements_receipt_id_idx" ON "inventory_movements"("receipt_id");
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_line_cost_non_negative" CHECK ("line_cost" IS NULL OR "line_cost" >= 0);
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_receipt_is_restock" CHECK ("receipt_id" IS NULL OR "movement_type" = 'RESTOCK');

-- Live updates (see 20261116000000_saas_multi_tenant).
CREATE TRIGGER "pos_notify_ins_stock_receipts" AFTER INSERT ON "stock_receipts" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION "pos_notify_new_rows"();
CREATE TRIGGER "pos_notify_upd_stock_receipts" AFTER UPDATE ON "stock_receipts" REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION "pos_notify_new_rows"();
CREATE TRIGGER "pos_notify_del_stock_receipts" AFTER DELETE ON "stock_receipts" REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION "pos_notify_old_rows"();

ALTER TABLE "stock_receipts" ENABLE ROW LEVEL SECURITY;
