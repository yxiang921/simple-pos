"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireContext } from "@/lib/tenant";
import { runAction } from "@/lib/action-utils";
import type { ActionResult } from "@/lib/errors";
import {
  deleteCategory,
  deleteMenuItem,
  saveCategory,
  saveMenuItem,
  setMenuItemAvailability,
} from "@/lib/services/menu";
import { categorySchema, idString, menuItemSchema } from "@/lib/validation";

function revalidateMenu() {
  revalidatePath("/admin/menu", "layout");
  revalidatePath("/s", "layout");
}

/** Payload is a plain object (built by the client form) so the recipe array survives intact. */
export async function saveMenuItemAction(id: string | null, payload: unknown): Promise<ActionResult> {
  const ctx = await requireContext();
  const res = await runAction(async () => {
    const input = menuItemSchema.parse(payload);
    await saveMenuItem(ctx.merchant.id, id ? idString.parse(id) : null, input);
    revalidateMenu();
  });
  if (res.ok) redirect("/admin/menu?saved=1");
  return res;
}

export async function deleteMenuItemAction(id: string) {
  const ctx = await requireContext();
  return runAction(async () => {
    const outcome = await deleteMenuItem(ctx.merchant.id, idString.parse(id));
    revalidateMenu();
    return outcome;
  });
}

/** In a branch: on/off at that branch. In "All branches": the shared on/off switch. */
export async function toggleMenuItemAvailabilityAction(id: string, isAvailable: boolean) {
  const ctx = await requireContext();
  return runAction(async () => {
    await setMenuItemAvailability(ctx.merchant.id, idString.parse(id), z.boolean().parse(isAvailable), ctx.branch?.id ?? null);
    revalidateMenu();
  });
}

export async function saveCategoryAction(id: string | null, payload: unknown) {
  const ctx = await requireContext();
  return runAction(async () => {
    const input = categorySchema.parse(payload);
    await saveCategory(ctx.merchant.id, id ? idString.parse(id) : null, input);
    revalidateMenu();
  });
}

export async function deleteCategoryAction(id: string) {
  const ctx = await requireContext();
  return runAction(async () => {
    await deleteCategory(ctx.merchant.id, idString.parse(id));
    revalidateMenu();
  });
}
