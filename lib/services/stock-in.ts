import { Prisma } from "@/lib/generated/prisma/client";
import { prisma, table } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { costPerBaseUnit, toBaseUnit } from "@/lib/units";
import { localDate, zonedTimeToUtc } from "@/lib/time";
import type { StockReceiptInput } from "@/lib/validation";
import { changeBranchStock, lockBranchStock } from "@/lib/services/orders";

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

  // A handful of statements whatever the number of lines (each is a network round trip on hosted setups).
  return prisma.$transaction(
    async (tx) => {
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
      const ids = sorted.map((l) => l.ing.id);

      // Make sure every stock row exists, then lock them in a fixed order.
      await tx.$executeRaw`
        INSERT INTO ${table("ingredient_stocks")} (id, branch_id, ingredient_id, current_stock, low_stock_threshold, updated_at)
        SELECT gen_random_uuid()::text, ${branchId}, v.id, 0, 0, now() FROM unnest(${ids}::text[]) AS v(id)
        ON CONFLICT (branch_id, ingredient_id) DO NOTHING`;
      const locked = await lockBranchStock(tx, branchId, ids);

      const balances = new Map<string, Prisma.Decimal>();
      for (const l of sorted) {
        const balance = new D(locked.get(l.ing.id)?.current_stock ?? 0).add(l.qty);
        if (balance.gt(new D("99999999999.999"))) throw new DomainError(`Resulting stock of ${l.ing.name} is too large.`);
        balances.set(l.ing.id, balance);
      }
      await changeBranchStock(tx, branchId, sorted.map((l) => ({ ingredientId: l.ing.id, delta: l.qty })));

      const label = `Stock in #${receipt.receiptNumber}${input.supplier ? ` · ${input.supplier}` : ""}${input.reference ? ` · ${input.reference}` : ""}`;
      await tx.inventoryMovement.createMany({
        data: sorted.map((l) => ({
          branchId,
          ingredientId: l.ing.id,
          receiptId: receipt.id,
          movementType: "RESTOCK" as const,
          quantityChange: l.qty,
          balanceAfter: balances.get(l.ing.id)!,
          lineCost: l.cost,
          reason: label,
          createdBy: actor,
          createdAt: receivedAt,
        })),
      });

      const costed = input.updateCosts ? sorted.filter((l) => l.unitCost) : [];
      if (costed.length) {
        await tx.$executeRaw`
          UPDATE ${table("ingredients")} AS i SET cost_per_unit = v.cost, updated_at = now()
          FROM unnest(${costed.map((l) => l.ing.id)}::text[], ${costed.map((l) => l.unitCost!.toString())}::numeric[]) AS v(id, cost)
          WHERE i.id = v.id`;
      }
      return { id: receipt.id, receiptNumber: receipt.receiptNumber, lines: lines.length, totalCost: totalCost?.toFixed(2) ?? null };
    },
    { maxWait: 10_000, timeout: 30_000 },
  );
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
