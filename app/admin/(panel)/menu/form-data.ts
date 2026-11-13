import "server-only";
import { prisma } from "@/lib/db";
import type { BaseUnitCode } from "@/lib/format";
import type { IngredientOption } from "./menu-item-form";

export async function loadFormOptions() {
  const [categories, ingredients] = await Promise.all([
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true } }),
    prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
  ]);
  const options: IngredientOption[] = ingredients.map((i) => ({
    id: i.id,
    name: i.name,
    unit: i.unit as BaseUnitCode,
    isActive: i.isActive,
    currentStock: i.currentStock.toString(),
  }));
  return { categories, ingredients: options };
}
