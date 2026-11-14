import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma, table } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { costPerBaseUnit, toBaseUnit } from "@/lib/units";
import { localDate, zonedTimeToUtc } from "@/lib/time";
import type { StockReceiptInput } from "@/lib/validation";

const D = Prisma.Decimal;

/**
 * Receive a delivery at a branch: every line adds stock (RESTOCK movement linked
 * to the receipt), all in one transaction with the stock rows locked in a fixed
 * order. With `updateCosts`, a line with a cost also sets the ingredient's cost
 * per unit (line cost ÷ quantity) — the shared catalog cost used for profit.
 */
export async function receiveStock(branchId: string, input: StockReceiptInput, actor: string | null, timezone: string) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { merchantId: true } });
  if (!branch) throw new DomainError("Branch not found.", "NOT_FOUND");
  const ids = input.lines.map((l) => l.ingredientId);
  const ingredients = await prisma.ingredient.findMany({
    where: { id: { in: ids }, merchantId: branch.merchantId },
    select: { id: true, name: true, unit: true, isActive: true },
  });
  const byId = new Map(ingredients.map((i) => [i.id, i]));

  const lines = input.lines.map((l) => {
    const ing = byId.get(l.ingredientId);
    if (!ing) throw new DomainError("An ingredient in this delivery no longer exists. Refresh and try again.");
    const qty = toBaseUnit(l.quantity, l.inputUnit, ing.unit);
    if (qty.lte(0)) throw new DomainError(`Quantity for ${ing.name} must be greater than 0.`);
    if (qty.gt(new D("99999999999.999"))) throw new DomainError(`Quantity for ${ing.name} is too large.`);
    const cost = l.lineCost ? new D(l.lineCost) : null;
    const unitCost = cost && cost.gt(0) ? costPerBaseUnit(cost.div(qty).toDecimalPlaces(6).toString(), undefined, ing.unit) : null;
    return { ing, qty, cost, unitCost };
  });

  const today = localDate(new Date(), timezone);
  if (input.receivedDate && input.receivedDate > today) throw new DomainError("The delivery date can't be in the future.");
  // A past date is stored at noon local time; today at the current time.
  const receivedAt = !input.receivedDate || input.receivedDate === today ? new Date() : zonedTimeToUtc(input.receivedDate, "12:00", timezone);
  const totalCost = lines.some((l) => l.cost) ? lines.reduce((s, l) => s.add(l.cost ?? 0), new D(0)) : null;

  return prisma.$transaction(async (tx) => {
    const receipt = await tx.stockReceipt.create({
      data: {
        branchId,
        supplier: input.supplier,
        reference: input.reference,
        note: input.note,
        receivedAt,
        totalCost,
        createdBy: actor,
      },
    });
    const sorted = [...lines].sort((a, b) => a.ing.id.localeCompare(b.ing.id));
    for (const l of sorted) {
      await tx.$executeRaw`
        INSERT INTO ${table("ingredient_stocks")} (id, branch_id, ingredient_id, current_stock, low_stock_threshold, updated_at)
        VALUES (${randomUUID()}, ${branchId}, ${l.ing.id}, 0, 0, now())
        ON CONFLICT (branch_id, ingredient_id) DO NOTHING`;
    }
    const locked = await tx.$queryRaw<{ ingredient_id: string; current_stock: string }[]>`
      SELECT ingredient_id, current_stock::text AS current_stock FROM ${table("ingredient_stocks")}
      WHERE branch_id = ${branchId} AND ingredient_id IN (${Prisma.join(sorted.map((l) => l.ing.id))})
      ORDER BY ingredient_id FOR UPDATE`;
    const current = new Map(locked.map((r) => [r.ingredient_id, new D(r.current_stock)]));

    const label = `Stock in #${receipt.receiptNumber}${input.supplier ? ` · ${input.supplier}` : ""}${input.reference ? ` · ${input.reference}` : ""}`;
    for (const l of sorted) {
      const balance = (current.get(l.ing.id) ?? new D(0)).add(l.qty);
      if (balance.gt(new D("99999999999.999"))) throw new DomainError(`Resulting stock of ${l.ing.name} is too large.`);
      await tx.ingredientStock.update({
        where: { branchId_ingredientId: { branchId, ingredientId: l.ing.id } },
        data: { currentStock: { increment: l.qty } },
      });
      await tx.inventoryMovement.create({
        data: {
          branchId,
          ingredientId: l.ing.id,
          receiptId: receipt.id,
          movementType: "RESTOCK",
          quantityChange: l.qty,
          balanceAfter: balance,
          lineCost: l.cost,
          reason: label,
          createdBy: actor,
          createdAt: receivedAt,
        },
      });
      if (input.updateCosts && l.unitCost) {
        await tx.ingredient.update({ where: { id: l.ing.id }, data: { costPerUnit: l.unitCost } });
      }
    }
    return { id: receipt.id, receiptNumber: receipt.receiptNumber, lines: lines.length, totalCost: totalCost?.toFixed(2) ?? null };
  });
}

/** Distinct supplier names used before by this merchant (for suggestions). */
export async function knownSuppliers(merchantId: string) {
  const rows = await prisma.stockReceipt.findMany({
    where: { branch: { merchantId }, supplier: { not: "" } },
    distinct: ["supplier"],
    select: { supplier: true },
    orderBy: { supplier: "asc" },
    take: 100,
  });
  return rows.map((r) => r.supplier);
}
