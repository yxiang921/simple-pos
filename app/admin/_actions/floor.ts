"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { runAction } from "@/lib/action-utils";
import { createSampleLayout, saveFloorLayout } from "@/lib/services/floor";
import { floorLayoutSchema } from "@/lib/validation";

export async function saveFloorLayoutAction(payload: unknown) {
  await requireAdmin();
  return runAction(async () => {
    const res = await saveFloorLayout(floorLayoutSchema.parse(payload));
    revalidatePath("/admin/floor");
    return res;
  });
}

export async function createSampleLayoutAction(replace: boolean) {
  await requireAdmin();
  return runAction(async () => {
    const res = await createSampleLayout({ replace: replace === true });
    revalidatePath("/admin/floor");
    return res;
  });
}
