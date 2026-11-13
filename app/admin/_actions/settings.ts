"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/session";
import { formObject, runAction } from "@/lib/action-utils";
import type { ActionResult } from "@/lib/errors";
import { storeSettingsSchema } from "@/lib/validation";

export async function saveSettingsAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  return runAction(async () => {
    const input = storeSettingsSchema.parse(formObject(fd));
    await prisma.storeSetting.upsert({
      where: { id: 1 },
      create: { id: 1, ...input },
      update: input,
    });
    revalidatePath("/", "layout");
  });
}
