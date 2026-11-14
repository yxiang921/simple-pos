"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession } from "@/lib/auth/session";
import { formObject } from "@/lib/action-utils";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { FieldError, isSlugAvailable, registerMerchant } from "@/lib/services/merchants";
import { fieldErrors, registerSchema } from "@/lib/validation";
import { SLUG_RE } from "@/lib/slug";
import type { ActionResult } from "@/lib/errors";

export async function registerAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  const ip = await clientIp();
  const limit = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000);
  if (!limit.ok) return { ok: false, error: `Too many sign-ups from this network. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` };

  let userId: string;
  try {
    ({ userId } = await registerMerchant(parsed.data));
  } catch (err) {
    if (err instanceof FieldError) return { ok: false, error: err.message, fieldErrors: { [err.field]: [err.message] } };
    console.error("[register] unexpected error", err);
    return { ok: false, error: "We couldn't create your account. Please try again." };
  }
  await createSession(userId);
  redirect("/admin/dashboard?welcome=1");
}

/** Live check while typing the shop URL. */
export async function checkSlugAction(slug: string): Promise<boolean> {
  const s = z.string().max(40).safeParse(slug);
  if (!s.success || !SLUG_RE.test(s.data)) return false;
  const ip = await clientIp();
  if (!rateLimit(`slug:${ip}`, 60, 60_000).ok) return true; // don't block typing; the final submit re-checks
  return isSlugAvailable(s.data);
}
