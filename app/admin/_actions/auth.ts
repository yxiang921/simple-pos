"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getDummyHash, hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, requireAdmin, revokeOtherSessions } from "@/lib/auth/session";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { changePasswordSchema, fieldErrors, loginSchema } from "@/lib/validation";
import { formObject, runAction } from "@/lib/action-utils";
import type { ActionResult } from "@/lib/errors";
import { DomainError } from "@/lib/errors";

export async function loginAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(formObject(fd));
  if (!parsed.success) return { ok: false, error: "Enter your email and password.", fieldErrors: fieldErrors(parsed.error) };

  const ip = await clientIp();
  const limit = rateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!limit.ok) {
    return { ok: false, error: `Too many sign-in attempts. Try again in ${Math.ceil(limit.retryAfterSec / 60)} min.` };
  }

  const user = await prisma.adminUser.findUnique({ where: { email: parsed.data.email } });
  // Always run a hash comparison so response time doesn't reveal whether the email exists.
  const valid = await verifyPassword(parsed.data.password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !valid) return { ok: false, error: "Incorrect email or password." };

  await createSession(user.id);
  redirect("/admin/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/admin/login");
}

export async function changePasswordAction(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  return runAction(async () => {
    const input = changePasswordSchema.parse(formObject(fd));
    const user = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new DomainError("Current password is incorrect.");
    }
    await prisma.adminUser.update({
      where: { id: admin.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    });
    await revokeOtherSessions(admin.id);
    return undefined;
  });
}
