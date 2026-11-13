"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/session";
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
  revalidatePath("/order", "layout");
}

/** Payload is a plain object (built by the client form) so the recipe array survives intact. */
export async function saveMenuItemAction(id: string | null, payload: unknown): Promise<ActionResult> {
  await requireAdmin();
  const res = await runAction(async () => {
    const input = menuItemSchema.parse(payload);
    await saveMenuItem(id ? idString.parse(id) : null, input);
    revalidateMenu();
  });
  if (res.ok) redirect("/admin/menu?saved=1");
  return res;
}

export async function deleteMenuItemAction(id: string) {
  await requireAdmin();
  return runAction(async () => {
    const outcome = await deleteMenuItem(idString.parse(id));
    revalidateMenu();
    return outcome;
  });
}

export async function toggleMenuItemAvailabilityAction(id: string, isAvailable: boolean) {
  await requireAdmin();
  return runAction(async () => {
    await setMenuItemAvailability(idString.parse(id), z.boolean().parse(isAvailable));
    revalidateMenu();
  });
}

export async function saveCategoryAction(id: string | null, payload: unknown) {
  await requireAdmin();
  return runAction(async () => {
    const input = categorySchema.parse(payload);
    await saveCategory(id ? idString.parse(id) : null, input);
    revalidateMenu();
  });
}

export async function deleteCategoryAction(id: string) {
  await requireAdmin();
  return runAction(async () => {
    await deleteCategory(idString.parse(id));
    revalidateMenu();
  });
}
