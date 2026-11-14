"use server";

import { revalidatePath } from "next/cache";
import { requireContext, targetBranch } from "@/lib/tenant";
import { runAction } from "@/lib/action-utils";
import { adjustStock, createIngredient, deleteIngredient, updateIngredient } from "@/lib/services/inventory";
import { idString, ingredientCreateSchema, ingredientUpdateSchema, stockAdjustmentSchema } from "@/lib/validation";

function revalidate() {
  revalidatePath("/admin", "layout");
  revalidatePath("/s", "layout");
}

/** Branch chosen in a dialog (HQ "All branches" view); otherwise the selected branch. */
function branchOf(payload: unknown): string | null {
  const v = (payload as { branchId?: unknown } | null)?.branchId;
  return typeof v === "string" && v ? idString.parse(v) : null;
}

export async function createIngredientAction(payload: unknown) {
  const ctx = await requireContext();
  return runAction(async () => {
    // Opening stock goes to the chosen / selected branch, or headquarters in the overview.
    const branch = branchOf(payload) ? targetBranch(ctx, branchOf(payload)) : (ctx.branch ?? ctx.hq);
    await createIngredient(ctx.merchant.id, branch.id, ingredientCreateSchema.parse(payload), ctx.admin.email);
    revalidate();
  });
}

export async function updateIngredientAction(payload: unknown) {
  const ctx = await requireContext();
  return runAction(async () => {
    // Low-stock threshold: the selected branch, or every branch in the overview.
    await updateIngredient(ctx.merchant.id, ctx.branch?.id ?? null, ingredientUpdateSchema.parse(payload));
    revalidate();
  });
}

export async function adjustStockAction(payload: unknown) {
  const ctx = await requireContext();
  return runAction(async () => {
    const branch = targetBranch(ctx, branchOf(payload));
    const m = await adjustStock(branch.id, stockAdjustmentSchema.parse(payload), ctx.admin.email);
    revalidate();
    return { balanceAfter: m.balanceAfter.toString(), branch: branch.name };
  });
}

export async function deleteIngredientAction(id: string) {
  const ctx = await requireContext();
  return runAction(async () => {
    await deleteIngredient(ctx.merchant.id, idString.parse(id));
    revalidate();
  });
}
