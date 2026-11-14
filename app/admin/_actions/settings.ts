"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/tenant";
import { formObject, runAction } from "@/lib/action-utils";
import type { ActionResult } from "@/lib/errors";
import { storeSettingsSchema } from "@/lib/validation";

/** Settings are shared by all branches of the merchant. */
export async function saveSettingsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const ctx = await requireContext();
  return runAction(async () => {
    const input = storeSettingsSchema.parse(formObject(fd));
    const merchantId = ctx.merchant.id;
    await prisma.$transaction([
      prisma.storeSetting.upsert({ where: { merchantId }, create: { merchantId, ...input }, update: input }),
      prisma.merchant.update({ where: { id: merchantId }, data: { name: input.storeName } }),
    ]);
    revalidatePath("/", "layout");
  });
}
