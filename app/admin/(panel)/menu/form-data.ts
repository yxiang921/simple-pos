import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { BaseUnitCode } from "@/lib/format";
import type { AdminContext } from "@/lib/tenant";
import type { IngredientOption } from "./menu-item-form";

/** Categories and ingredients of the merchant; stock shown is the selected branch's, or the total of all branches. */
export async function loadFormOptions(ctx: AdminContext) {
  const [categories, ingredients] = await Promise.all([
    prisma.category.findMany({
      where: { merchantId: ctx.merchant.id },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    prisma.ingredient.findMany({
      where: { merchantId: ctx.merchant.id },
      orderBy: { name: "asc" },
      include: { stocks: { where: ctx.branch ? { branchId: ctx.branch.id } : {}, select: { currentStock: true } } },
    }),
  ]);
  const options: IngredientOption[] = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit as BaseUnitCode,
    isActive: i.isActive,
    currentStock: i.stocks.reduce((s, x) => s.add(x.currentStock), new Prisma.Decimal(0)).toString(),
  }));
  return { categories, ingredients: options, stockLabel: ctx.branch && ctx.branches.length > 1 ? `In stock at ${ctx.branch.name}` : ctx.branches.length > 1 ? "In stock (all branches)" : "In stock" };
}
