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

export async function createIngredient(
  input: { name: string; sku: string | null; unit: BaseUnit; initialStock: string; lowStockThreshold: string } & CostInput,
  actor?: string,
) {
  const initial = new D(input.initialStock);
  const costPerUnit = costPerBaseUnit(input.cost ?? null, input.costUnit, input.unit);
  try {
    return await prisma.$transaction(async (tx) => {
      const ingredient = await tx.ingredient.create({
        data: {
          name: input.name,
          sku: input.sku,
          unit: input.unit,
          currentStock: initial,
          lowStockThreshold: new D(input.lowStockThreshold),
          costPerUnit,
        },
      });
      if (initial.gt(0)) {
        await tx.inventoryMovement.create({
          data: {
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

export async function updateIngredient(
  input: {
    id: string;
    name: string;
    sku: string | null;
    lowStockThreshold: string;
    isActive: boolean;
  } & CostInput,
) {
  const existing = await prisma.ingredient.findUnique({ where: { id: input.id }, select: { unit: true } });
  if (!existing) throw new DomainError("Ingredient not found.", "NOT_FOUND");
  const costPerUnit = costPerBaseUnit(input.cost ?? null, input.costUnit, existing.unit);
  try {
    return await prisma.ingredient.update({
      where: { id: input.id },
      data: {
        name: input.name,
        sku: input.sku,
        lowStockThreshold: new D(input.lowStockThreshold),
        isActive: input.isActive,
        costPerUnit,
      },
    });
  } catch (err) {
    uniqueMessage(err);
  }
}

/**
 * Restock (add) or manually deduct (wastage / correction) stock.
 * The row is locked so the recorded balance is exact and stock never goes negative.
 */
export async function adjustStock(
  input: { ingredientId: string; kind: "RESTOCK" | "DEDUCT"; quantity: string; inputUnit: InputUnit; reason: string },
  actor?: string,
) {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string; unit: BaseUnit; current_stock: string }[]>`
      SELECT id, unit::text AS unit, current_stock::text AS current_stock
      FROM ${table("ingredients")} WHERE id = ${input.ingredientId} FOR UPDATE`;
    if (!row) throw new DomainError("Ingredient not found.", "NOT_FOUND");

    const qty = toBaseUnit(input.quantity, input.inputUnit, row.unit);
    if (qty.lte(0)) throw new DomainError("Quantity must be greater than 0.");
    const current = new D(row.current_stock);
    const change = input.kind === "RESTOCK" ? qty : qty.neg();
    const balance = current.add(change);
    if (balance.lt(0)) {
      throw new DomainError(`Cannot deduct more than the current stock (${current.toString()}).`, "NEGATIVE_STOCK");
    }
    if (balance.gt(new D("99999999999.999"))) throw new DomainError("Resulting stock is too large.");

    await tx.ingredient.update({
      where: { id: row.id },
      data: { currentStock: input.kind === "RESTOCK" ? { increment: qty } : { decrement: qty } },
    });
    return tx.inventoryMovement.create({
      data: {
        ingredientId: row.id,
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
export async function deleteIngredient(id: string) {
  return prisma.$transaction(async (tx) => {
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

/** Active ingredients at or below their low-stock threshold. */
export async function lowStockIngredients(limit?: number) {
  return prisma.ingredient.findMany({
    where: { isActive: true, currentStock: { lte: prisma.ingredient.fields.lowStockThreshold } },
    orderBy: [{ currentStock: "asc" }],
    take: limit,
  });
}

export async function countLowStock() {
  return prisma.ingredient.count({
    where: { isActive: true, currentStock: { lte: prisma.ingredient.fields.lowStockThreshold } },
  });
}

export type StockStatus = "OK" | "LOW" | "OUT" | "INACTIVE";

export function stockStatus(i: { currentStock: Prisma.Decimal; lowStockThreshold: Prisma.Decimal; isActive: boolean }): StockStatus {
  if (!i.isActive) return "INACTIVE";
  if (i.currentStock.lte(0)) return "OUT";
  if (i.currentStock.lte(i.lowStockThreshold)) return "LOW";
  return "OK";
}
