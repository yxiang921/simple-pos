"use server";

import { revalidatePath } from "next/cache";
import { requireContext } from "@/lib/tenant";
import { runAction } from "@/lib/action-utils";
import { createSampleLayout, saveFloorLayout } from "@/lib/services/floor";
import { floorLayoutSchema } from "@/lib/validation";

/** The floor plan is shared by all of the merchant's branches. */
export async function saveFloorLayoutAction(payload: unknown) {
  const ctx = await requireContext();
  return runAction(async () => {
    const res = await saveFloorLayout(ctx.merchant.id, floorLayoutSchema.parse(payload));
    revalidatePath("/admin/floor");
    return res;
  });
}

export async function createSampleLayoutAction(replace: boolean) {
  const ctx = await requireContext();
  return runAction(async () => {
    const res = await createSampleLayout(ctx.merchant.id, { replace: replace === true });
    revalidatePath("/admin/floor");
    return res;
  });
}
