"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { runAction } from "@/lib/action-utils";
import { adjustStock, createIngredient, deleteIngredient, updateIngredient } from "@/lib/services/inventory";
import { idString, ingredientCreateSchema, ingredientUpdateSchema, stockAdjustmentSchema } from "@/lib/validation";

function revalidate() {
  revalidatePath("/admin", "layout");
  revalidatePath("/order", "layout");
}

export async function createIngredientAction(payload: unknown) {
  const admin = await requireAdmin();
  return runAction(async () => {
    await createIngredient(ingredientCreateSchema.parse(payload), admin.email);
    revalidate();
  });
}

export async function updateIngredientAction(payload: unknown) {
  await requireAdmin();
  return runAction(async () => {
    await updateIngredient(ingredientUpdateSchema.parse(payload));
    revalidate();
  });
}

export async function adjustStockAction(payload: unknown) {
  const admin = await requireAdmin();
  return runAction(async () => {
    const m = await adjustStock(stockAdjustmentSchema.parse(payload), admin.email);
    revalidate();
    return { balanceAfter: m.balanceAfter.toString() };
  });
}

export async function deleteIngredientAction(id: string) {
  await requireAdmin();
  return runAction(async () => {
    await deleteIngredient(idString.parse(id));
    revalidate();
  });
}
