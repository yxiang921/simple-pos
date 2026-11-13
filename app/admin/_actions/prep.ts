"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/session";
import { runAction } from "@/lib/action-utils";
import { savePrep } from "@/lib/services/prep";
import { dailyPrepSchema } from "@/lib/validation";

export async function savePrepAction(payload: unknown) {
  await requireAdmin();
  return runAction(async () => {
    const input = dailyPrepSchema.parse(payload);
    const res = await savePrep(input.date, input.entries);
    revalidatePath("/admin/prep");
    return res;
  });
}
