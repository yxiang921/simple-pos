"use server";

import { revalidatePath } from "next/cache";
import { requireContext, targetBranch } from "@/lib/tenant";
import { runAction } from "@/lib/action-utils";
import { receiveStock } from "@/lib/services/stock-in";
import { stockReceiptSchema } from "@/lib/validation";

/** Record a delivery (several ingredients at once) at the selected / chosen branch. */
export async function receiveStockAction(payload: unknown) {
  const ctx = await requireContext();
  return runAction(async () => {
    const input = stockReceiptSchema.parse(payload);
    const branch = targetBranch(ctx, input.branchId ?? null);
    const res = await receiveStock(branch.id, input, ctx.admin.email, ctx.settings.timezone);
    revalidatePath("/admin", "layout");
    revalidatePath("/s", "layout");
    return res;
  });
}
