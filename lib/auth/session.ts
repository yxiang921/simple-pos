import "server-only";
import { createHmac, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";

export const SESSION_COOKIE = "pos_admin_session";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  }
  return s;
}

function ttlMs() {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 12);
  return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 60 * 60 * 1000;
}

/** Only an HMAC of the token is stored, so a leaked sessions table cannot be replayed. */
function hashToken(token: string) {
  return createHmac("sha256", secret()).update(token).digest("hex");
}

export async function createSession(adminUserId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ttlMs());
  await prisma.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await prisma.adminSession.create({ data: { tokenHash: hashToken(token), adminUserId, expiresAt } });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.adminSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export type CurrentAdmin = { id: string; email: string; name: string; merchantId: string };

/** Validates the session cookie against the database. Memoized per request. */
export const getCurrentAdmin = cache(async (): Promise<CurrentAdmin | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 128) return null;
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { adminUser: { select: { id: true, email: true, name: true, merchantId: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.adminUser;
});

/** Use at the top of every admin page and admin server action. */
export async function requireAdmin(): Promise<CurrentAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  return admin;
}

export async function revokeOtherSessions(adminUserId: string) {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  await prisma.adminSession.deleteMany({
    where: { adminUserId, ...(token ? { tokenHash: { not: hashToken(token) } } : {}) },
  });
}
