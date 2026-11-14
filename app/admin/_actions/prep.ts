"use server";

import { revalidatePath } from "next/cache";
import { requireContext, targetBranch } from "@/lib/tenant";
import { runAction } from "@/lib/action-utils";
import { savePrep } from "@/lib/services/prep";
import { dailyPrepSchema, idString } from "@/lib/validation";

export async function savePrepAction(branchId: string, payload: unknown) {
  const ctx = await requireContext();
  return runAction(async () => {
    const branch = targetBranch(ctx, idString.parse(branchId));
    const input = dailyPrepSchema.parse(payload);
    const res = await savePrep(branch.id, input.date, input.entries);
    revalidatePath("/admin/prep");
    return res;
  });
}
