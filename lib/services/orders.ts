import { createHash } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import type { BaseUnit, OrderStatus } from "@/lib/generated/prisma/enums";
import { prisma, table, type TxClient } from "@/lib/db";
import { DomainError, InsufficientStockError, isUniqueViolation, type StockShortage } from "@/lib/errors";
import { createOrderSchema, type CreateOrderInput } from "@/lib/validation";
import { normalizeTableNumber } from "@/lib/floor";

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

const TX_OPTIONS = {
  isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
  maxWait: 10_000,
  timeout: 20_000,
} as const;

export type CreatedOrder = { id: string; orderNumber: number; replayed: boolean };

type LockedStockRow = {
  id: string;
  current_stock: string;
  is_active: boolean;
};

/**
 * Lock one branch's stock rows for the given ingredients in a deterministic
 * order (by ingredient id) so concurrent transactions touching overlapping
 * ingredients cannot deadlock. Ingredients the branch has never stocked have
 * no row and count as 0.
 */
export async function lockBranchStock(tx: TxClient, branchId: string, ingredientIds: string[]) {
  if (ingredientIds.length === 0) return new Map<string, LockedStockRow>();
  const sorted = [...ingredientIds].sort();
  const rows = await tx.$queryRaw<LockedStockRow[]>`
    SELECT s.ingredient_id AS id, s.current_stock::text AS current_stock, i.is_active
    FROM ${table("ingredient_stocks")} s
    JOIN ${table("ingredients")} i ON i.id = s.ingredient_id
    WHERE s.branch_id = ${branchId} AND s.ingredient_id IN (${Prisma.join(sorted)})
    ORDER BY s.ingredient_id
    FOR UPDATE OF s`;
  return new Map(rows.map((r) => [r.id, r]));
}

function hashRequest(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function replayExisting(idempotencyKey: string, requestHash: string): Promise<CreatedOrder> {
  const existing = await prisma.order.findUnique({
    where: { idempotencyKey },
    select: { id: true, orderNumber: true, requestHash: true },
  });
  if (!existing) throw new DomainError("Could not complete the order. Please try again.");
  if (existing.requestHash !== requestHash) {
    throw new DomainError(
      "This checkout was already submitted with a different cart. Please review your cart and submit again.",
      "IDEMPOTENCY_CONFLICT",
    );
  }
  return { id: existing.id, orderNumber: existing.orderNumber, replayed: true };
}

/**
 * Create a guest order at a branch and deduct that branch's ingredient stock atomically.
 *
 * Guarantees:
 *  - Prices, totals and ingredient requirements are computed from the database only.
 *  - Requirements are aggregated across the whole cart before stock is checked.
 *  - Order, items, ingredient snapshots, stock deduction and movements commit together.
 *  - Ingredient rows are locked (SELECT … FOR UPDATE) and decremented with a
 *    conditional UPDATE, so concurrent orders can never oversell or go negative.
 *  - The idempotency key is unique: retries return the original order and never
 *    deduct twice, even when submitted concurrently.
 */
export async function createOrder(branchId: string, raw: CreateOrderInput): Promise<CreatedOrder> {
  const input = createOrderSchema.parse(raw);
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true, merchantId: true, isActive: true } });
  if (!branch || !branch.isActive) throw new DomainError("This outlet is not taking orders.", "NOT_ACCEPTING");
  const merchantId = branch.merchantId;

  // Merge duplicate lines for the same menu item, order deterministically.
  const qtyByItem = new Map<string, number>();
  for (const line of input.items) {
    qtyByItem.set(line.menuItemId, (qtyByItem.get(line.menuItemId) ?? 0) + line.quantity);
  }
  const lines = [...qtyByItem.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [, qty] of lines) {
    if (qty > 50) throw new DomainError("Maximum 50 of the same item per order.");
  }

  // When the shop has a floor plan, the table must be one of its tables; it is
  // stored in its standard form ("T05" → "5") so the order always matches the floor.
  let tableNumber = input.tableNumber;
  if (tableNumber) {
    const tables = await prisma.floorObject.findMany({ where: { merchantId, kind: "TABLE" }, select: { tableNumber: true } });
    if (tables.length) {
      const key = normalizeTableNumber(tableNumber);
      if (!key || !tables.some((t) => t.tableNumber === key)) {
        throw new DomainError(`Table ${tableNumber} isn't one of our tables. Please choose your table from the list.`, "UNKNOWN_TABLE");
      }
      tableNumber = key;
    }
  }

  const requestHash = hashRequest({
    branchId,
    customerName: input.customerName,
    tableNumber,
    lines,
  });

  // Fast path for retries of an order that already committed.
  const already = await prisma.order.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    select: { id: true },
  });
  if (already) return replayExisting(input.idempotencyKey, requestHash);

  const settings = await prisma.storeSetting.findUnique({ where: { merchantId } });
  if (settings && !settings.acceptingOrders) {
    throw new DomainError("Sorry, we are not accepting orders right now.", "NOT_ACCEPTING");
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const menuItems = await tx.menuItem.findMany({
        where: { id: { in: lines.map(([id]) => id) }, merchantId },
        include: {
          category: { select: { isActive: true } },
          branchStatus: { where: { branchId }, select: { isAvailable: true } },
          recipe: { include: { ingredient: { select: { id: true, name: true, unit: true } } } },
        },
      });
      const byId = new Map(menuItems.map((m) => [m.id, m]));

      // Price lines and aggregate ingredient requirements across the cart.
      let total: Decimal = new D(0);
      const orderLines: {
        menuItemId: string;
        name: string;
        quantity: number;
        unitPrice: Decimal;
        subtotal: Decimal;
      }[] = [];
      const requirements = new Map<string, { qty: Decimal; name: string; unit: BaseUnit; items: Set<string> }>();

      for (const [menuItemId, quantity] of lines) {
        const item = byId.get(menuItemId);
        if (!item || item.isArchived || !item.isAvailable || item.branchStatus[0]?.isAvailable === false || !item.category.isActive) {
          throw new DomainError(
            `${item?.name ?? "An item in your cart"} is no longer available. Please remove it and try again.`,
            "ITEM_UNAVAILABLE",
          );
        }
        const subtotal = item.price.mul(quantity);
        total = total.add(subtotal);
        orderLines.push({ menuItemId, name: item.name, quantity, unitPrice: item.price, subtotal });

        for (const r of item.recipe) {
          const need = r.quantityRequired.mul(quantity);
          const entry = requirements.get(r.ingredientId);
          if (entry) {
            entry.qty = entry.qty.add(need);
            entry.items.add(item.name);
          } else {
            requirements.set(r.ingredientId, {
              qty: need,
              name: r.ingredient.name,
              unit: r.ingredient.unit,
              items: new Set([item.name]),
            });
          }
        }
      }

      // Claim the idempotency key first. A concurrent duplicate blocks here on the
      // unique index and fails with P2002 once this transaction commits.
      const order = await tx.order.create({
        data: {
          branchId,
          customerName: input.customerName,
          tableNumber,
          totalAmount: total,
          idempotencyKey: input.idempotencyKey,
          requestHash,
        },
        select: { id: true, orderNumber: true },
      });

      // Lock and validate all required ingredients before changing anything.
      const ingredientIds = [...requirements.keys()].sort();
      const locked = await lockBranchStock(tx, branchId, ingredientIds);
      const shortages: StockShortage[] = [];
      for (const id of ingredientIds) {
        const req = requirements.get(id)!;
        const row = locked.get(id);
        const available = row && row.is_active ? new D(row.current_stock) : new D(0);
        if (available.lt(req.qty)) {
          shortages.push({
            ingredientId: id,
            ingredientName: req.name,
            unit: req.unit,
            required: req.qty.toString(),
            available: available.toString(),
            affectedItems: [...req.items],
          });
        }
      }
      if (shortages.length) throw new InsufficientStockError(shortages);

      // Deduct with an atomic conditional update (defence in depth on top of the lock
      // and the CHECK (current_stock >= 0) constraint).
      const movements: Prisma.InventoryMovementCreateManyInput[] = [];
      const snapshots: Prisma.OrderIngredientCreateManyInput[] = [];
      for (const id of ingredientIds) {
        const req = requirements.get(id)!;
        const res = await tx.ingredientStock.updateMany({
          where: { branchId, ingredientId: id, ingredient: { isActive: true }, currentStock: { gte: req.qty } },
          data: { currentStock: { decrement: req.qty } },
        });
        if (res.count !== 1) {
          throw new InsufficientStockError([
            {
              ingredientId: id,
              ingredientName: req.name,
              unit: req.unit,
              required: req.qty.toString(),
              available: locked.get(id)?.current_stock ?? "0",
              affectedItems: [...req.items],
            },
          ]);
        }
        const balanceAfter = new D(locked.get(id)!.current_stock).sub(req.qty);
        snapshots.push({
          orderId: order.id,
          ingredientId: id,
          ingredientNameSnapshot: req.name,
          unitSnapshot: req.unit,
          quantityDeducted: req.qty,
        });
        movements.push({
          branchId,
          ingredientId: id,
          orderId: order.id,
          movementType: "ORDER_DEDUCTION",
          quantityChange: req.qty.neg(),
          balanceAfter,
          reason: `Order #${order.orderNumber}`,
        });
      }

      await tx.orderItem.createMany({
        data: orderLines.map((l) => ({
          orderId: order.id,
          menuItemId: l.menuItemId,
          menuItemNameSnapshot: l.name,
          quantity: l.quantity,
          unitPriceSnapshot: l.unitPrice,
          subtotal: l.subtotal,
        })),
      });
      if (snapshots.length) await tx.orderIngredient.createMany({ data: snapshots });
      if (movements.length) await tx.inventoryMovement.createMany({ data: movements });

      return { id: order.id, orderNumber: order.orderNumber, replayed: false };
    }, TX_OPTIONS);
  } catch (err) {
    if (isUniqueViolation(err, "idempotency_key") || isUniqueViolation(err, "idempotencyKey")) {
      return replayExisting(input.idempotencyKey, requestHash);
    }
    throw err;
  }
}

/**
 * Cancel an order and restore exactly the quantities that were deducted
 * (from the OrderIngredient snapshot, not the current recipe). Restoration
 * happens at most once: guarded by the order row lock, `stockRestoredAt`, and a
 * partial unique index on (order_id, ingredient_id, movement_type).
 */
export async function cancelOrder(orderId: string, reason: string, actor?: string) {
  return prisma.$transaction(async (tx) => {
    const [order] = await tx.$queryRaw<{ id: string; branch_id: string; order_number: number; status: OrderStatus; stock_restored_at: Date | null }[]>`
      SELECT id, branch_id, order_number, status::text AS status, stock_restored_at
      FROM ${table("orders")} WHERE id = ${orderId} FOR UPDATE`;
    if (!order) throw new DomainError("Order not found.", "NOT_FOUND");
    if (order.status === "CANCELLED") throw new DomainError("This order is already cancelled.", "ALREADY_CANCELLED");
    if (order.status === "COMPLETED") {
      throw new DomainError("Completed orders cannot be cancelled.", "INVALID_TRANSITION");
    }

    let restored = 0;
    if (!order.stock_restored_at) {
      const deducted = await tx.orderIngredient.findMany({
        where: { orderId },
        orderBy: { ingredientId: "asc" },
      });
      const branchId = order.branch_id;
      const locked = await lockBranchStock(
        tx,
        branchId,
        deducted.map((d) => d.ingredientId),
      );
      const movements: Prisma.InventoryMovementCreateManyInput[] = [];
      for (const d of deducted) {
        // The stock row exists (the order deducted from it); upsert covers rows removed since.
        await tx.ingredientStock.upsert({
          where: { branchId_ingredientId: { branchId, ingredientId: d.ingredientId } },
          update: { currentStock: { increment: d.quantityDeducted } },
          create: { branchId, ingredientId: d.ingredientId, currentStock: d.quantityDeducted },
        });
        movements.push({
          branchId,
          ingredientId: d.ingredientId,
          orderId,
          movementType: "ORDER_CANCELLATION",
          quantityChange: d.quantityDeducted,
          balanceAfter: new D(locked.get(d.ingredientId)?.current_stock ?? 0).add(d.quantityDeducted),
          reason: `Order #${order.order_number} cancelled: ${reason}`,
          createdBy: actor ?? null,
        });
      }
      if (movements.length) await tx.inventoryMovement.createMany({ data: movements });
      restored = movements.length;
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "CANCELLED",
        cancelReason: reason,
        cancelledAt: new Date(),
        stockRestoredAt: order.stock_restored_at ?? new Date(),
      },
    });
    return { restoredIngredients: restored };
  }, TX_OPTIONS);
}

const ACTIVE_STATUSES: OrderStatus[] = ["PENDING", "PREPARING", "READY"];

/** Move an order between non-final statuses or to COMPLETED. Cancelling uses cancelOrder(). */
export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  if (status === "CANCELLED") {
    throw new DomainError("Use cancel to cancel an order so stock is restored.", "INVALID_TRANSITION");
  }
  const res = await prisma.order.updateMany({
    where: { id: orderId, status: { in: ACTIVE_STATUSES } },
    data: { status },
  });
  if (res.count === 0) {
    const exists = await prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
    if (!exists) throw new DomainError("Order not found.", "NOT_FOUND");
    throw new DomainError(`Order is already ${exists.status.toLowerCase()} and cannot be changed.`, "INVALID_TRANSITION");
  }
}

export async function setPaymentStatus(orderId: string, paid: boolean) {
  const res = await prisma.order.updateMany({
    where: { id: orderId, status: { not: "CANCELLED" } },
    data: { paymentStatus: paid ? "PAID" : "UNPAID" },
  });
  if (res.count === 0) throw new DomainError("Cannot change payment on a cancelled or missing order.");
}
