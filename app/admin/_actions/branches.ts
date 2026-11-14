"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { z } from "zod";
import { ALL_BRANCHES, assertBranch, BRANCH_COOKIE, requireContext } from "@/lib/tenant";
import { runAction } from "@/lib/action-utils";
import { createBranch, updateBranch } from "@/lib/services/branches";
import { branchSchema, idString } from "@/lib/validation";

/** Switch the back office between one branch and "All branches" (remembered in a cookie). */
export async function switchBranchAction(to: string) {
  const ctx = await requireContext();
  return runAction(async () => {
    const value = to === ALL_BRANCHES ? ALL_BRANCHES : assertBranch(ctx, idString.parse(to)).id;
    const jar = await cookies();
    jar.set(BRANCH_COOKIE, value, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    revalidatePath("/admin", "layout");
  });
}

export async function saveBranchAction(id: string | null, payload: unknown) {
  const ctx = await requireContext();
  return runAction(async () => {
    const input = branchSchema.parse(payload);
    if (id) await updateBranch(ctx.merchant.id, idString.parse(id), { ...input, isActive: z.boolean().parse(input.isActive ?? true) });
    else await createBranch(ctx.merchant.id, input);
    revalidatePath("/admin", "layout");
  });
}
