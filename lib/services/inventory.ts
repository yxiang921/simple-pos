import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import type { BaseUnit } from "@/lib/generated/prisma/enums";
import { prisma, table } from "@/lib/db";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import { costPerBaseUnit, toBaseUnit, type InputUnit } from "@/lib/units";

const D = Prisma.Decimal;

function uniqueMessage(err: unknown): never {
  if (isUniqueViolation(err, "name")) throw new DomainError("An ingredient with this name already exists.");
  if (isUniqueViolation(err, "sku")) throw new DomainError("This SKU is already used by another ingredient.");
  throw err;
}

type CostInput = { cost?: string | null; costUnit?: InputUnit };

/**
 * Add an ingredient to the merchant's shared catalog. Every branch gets a stock
 * row with the low-stock threshold; the opening stock goes to `branchId`.
 */
export async function createIngredient(
  merchantId: string,
  branchId: string,
  input: { name: string; sku: string | null; unit: BaseUnit; initialStock: string; lowStockThreshold: string } & CostInput,
  actor?: string,
) {
  const initial = new D(input.initialStock);
  const threshold = new D(input.lowStockThreshold);
  const costPerUnit = costPerBaseUnit(input.cost ?? null, input.costUnit, input.unit);
  try {
    return await prisma.$transaction(async (tx) => {
      const branches = await tx.branch.findMany({ where: { merchantId }, select: { id: true } });
      if (!branches.some((b) => b.id === branchId)) throw new DomainError("Branch not found.", "NOT_FOUND");
      const ingredient = await tx.ingredient.create({
        data: { merchantId, name: input.name, sku: input.sku, unit: input.unit, costPerUnit },
      });
      await tx.ingredientStock.createMany({
        data: branches.map((b) => ({
          branchId: b.id,
          ingredientId: ingredient.id,
          currentStock: b.id === branchId ? initial : new D(0),
          lowStockThreshold: threshold,
        })),
      });
      if (initial.gt(0)) {
        await tx.inventoryMovement.create({
          data: {
            branchId,
            ingredientId: ingredient.id,
            movementType: "INITIAL",
            quantityChange: initial,
            balanceAfter: initial,
            reason: "Opening stock",
            createdBy: actor ?? null,
          },
        });
      }
      return ingredient;
    });
  } catch (err) {
    uniqueMessage(err);
  }
}

/**
 * Edit catalog fields (shared by all branches). The low-stock threshold is set
 * for `branchId`, or for every branch when branchId is null.
 */
export async function updateIngredient(
  merchantId: string,
  branchId: string | null,
  input: {
    id: string;
    name: string;
    sku: string | null;
    lowStockThreshold: string;
    isActive: boolean;
  } & CostInput,
) {
  const existing = await prisma.ingredient.findFirst({ where: { id: input.id, merchantId }, select: { unit: true } });
  if (!existing) throw new DomainError("Ingredient not found.", "NOT_FOUND");
  const costPerUnit = costPerBaseUnit(input.cost ?? null, input.costUnit, existing.unit);
  const threshold = new D(input.lowStockThreshold);
  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.ingredient.update({
        where: { id: input.id },
        data: { name: input.name, sku: input.sku, isActive: input.isActive, costPerUnit },
      });
      const branches = await tx.branch.findMany({ where: { merchantId, ...(branchId ? { id: branchId } : {}) }, select: { id: true } });
      for (const b of branches) {
        await tx.ingredientStock.upsert({
          where: { branchId_ingredientId: { branchId: b.id, ingredientId: input.id } },
          update: { lowStockThreshold: threshold },
          create: { branchId: b.id, ingredientId: input.id, lowStockThreshold: threshold },
        });
      }
      return updated;
    });
  } catch (err) {
    uniqueMessage(err);
  }
}

/**
 * Restock (add) or manually deduct (wastage / correction) stock at one branch.
 * The stock row is locked so the recorded balance is exact and stock never goes negative.
 */
export async function adjustStock(
  branchId: string,
  input: { ingredientId: string; kind: "RESTOCK" | "DEDUCT"; quantity: string; inputUnit: InputUnit; reason: string },
  actor?: string,
) {
  return prisma.$transaction(async (tx) => {
    const ing = await tx.ingredient.findFirst({
      where: { id: input.ingredientId, merchant: { branches: { some: { id: branchId } } } },
      select: { id: true, unit: true },
    });
    if (!ing) throw new DomainError("Ingredient not found.", "NOT_FOUND");
    await tx.$executeRaw`
      INSERT INTO ${table("ingredient_stocks")} (id, branch_id, ingredient_id, current_stock, low_stock_threshold, updated_at)
      VALUES (${randomUUID()}, ${branchId}, ${ing.id}, 0, 0, now())
      ON CONFLICT (branch_id, ingredient_id) DO NOTHING`;
    const [row] = await tx.$queryRaw<{ current_stock: string }[]>`
      SELECT current_stock::text AS current_stock FROM ${table("ingredient_stocks")}
      WHERE branch_id = ${branchId} AND ingredient_id = ${ing.id} FOR UPDATE`;

    const qty = toBaseUnit(input.quantity, input.inputUnit, ing.unit);
    if (qty.lte(0)) throw new DomainError("Quantity must be greater than 0.");
    const current = new D(row.current_stock);
    const change = input.kind === "RESTOCK" ? qty : qty.neg();
    const balance = current.add(change);
    if (balance.lt(0)) {
      throw new DomainError(`Cannot deduct more than the current stock (${current.toString()}).`, "NEGATIVE_STOCK");
    }
    if (balance.gt(new D("99999999999.999"))) throw new DomainError("Resulting stock is too large.");

    await tx.ingredientStock.update({
      where: { branchId_ingredientId: { branchId, ingredientId: ing.id } },
      data: { currentStock: input.kind === "RESTOCK" ? { increment: qty } : { decrement: qty } },
    });
    return tx.inventoryMovement.create({
      data: {
        branchId,
        ingredientId: ing.id,
        movementType: input.kind === "RESTOCK" ? "RESTOCK" : "ADJUSTMENT",
        quantityChange: change,
        balanceAfter: balance,
        reason: input.reason || (input.kind === "RESTOCK" ? "Restock" : "Manual deduction"),
        createdBy: actor ?? null,
      },
    });
  });
}

/**
 * Hard delete is only allowed for ingredients that were never used by a recipe
 * or an order. Otherwise the admin should deactivate it to keep history intact.
 */
export async function deleteIngredient(merchantId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    if (!(await tx.ingredient.findFirst({ where: { id, merchantId }, select: { id: true } }))) {
      throw new DomainError("Ingredient not found.", "NOT_FOUND");
    }
    const [recipes, orders] = await Promise.all([
      tx.menuItemIngredient.count({ where: { ingredientId: id } }),
      tx.orderIngredient.count({ where: { ingredientId: id } }),
    ]);
    if (recipes > 0) {
      throw new DomainError(`Used in ${recipes} menu recipe(s). Remove it from those recipes first, or deactivate it.`);
    }
    if (orders > 0) {
      throw new DomainError("This ingredient has order history and cannot be deleted. Deactivate it instead.");
    }
    await tx.inventoryMovement.deleteMany({ where: { ingredientId: id, orderId: null } });
    await tx.ingredient.delete({ where: { id } });
  });
}

export type BranchScope = { branchId: string } | { branch: { merchantId: string } };

const lowWhere = (scope: BranchScope) => ({
  ...scope,
  ingredient: { isActive: true },
  currentStock: { lte: prisma.ingredientStock.fields.lowStockThreshold },
});

/** Stock rows at or below their low-stock threshold (active ingredients), in a branch or across a merchant. */
export async function lowStockIngredients(scope: BranchScope, limit?: number) {
  return prisma.ingredientStock.findMany({
    where: lowWhere(scope),
    include: { ingredient: { select: { id: true, name: true, unit: true } }, branch: { select: { id: true, name: true } } },
    orderBy: [{ currentStock: "asc" }],
    take: limit,
  });
}

export async function countLowStock(scope: BranchScope) {
  return prisma.ingredientStock.count({ where: lowWhere(scope) });
}

export type StockStatus = "OK" | "LOW" | "OUT" | "INACTIVE";

export function stockStatus(i: { currentStock: Prisma.Decimal; lowStockThreshold: Prisma.Decimal; isActive: boolean }): StockStatus {
  if (!i.isActive) return "INACTIVE";
  if (i.currentStock.lte(0)) return "OUT";
  if (i.currentStock.lte(i.lowStockThreshold)) return "LOW";
  return "OK";
}
