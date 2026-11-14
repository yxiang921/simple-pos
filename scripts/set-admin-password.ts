/**
 * Create the owner account, or reset its password, from .env:
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *
 *   npm run admin:password
 *   npm run admin:password -- --merchant=kopi-co   # merchant for a NEW account (default: the first merchant)
 *
 * Also signs out all existing sessions for that admin.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { dbSchema } from "../lib/db-schema";
import { hashPassword, verifyPassword } from "../lib/auth/password";
import { requireCurrentClient } from "./lib/client-check";

async function main() {
  requireCurrentClient();
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env first.");

  console.log(`Schema: ${dbSchema()}`);
  const passwordHash = await hashPassword(password);
  const slug = process.argv.find((a) => a.startsWith("--merchant="))?.slice(11);
  const existing = await prisma.adminUser.findUnique({ where: { email }, select: { id: true } });
  let merchantId: string | null = null;
  if (!existing) {
    const m = await prisma.merchant.findFirst({ where: slug ? { slug } : {}, orderBy: { createdAt: "asc" }, select: { id: true, slug: true } });
    if (!m) throw new Error(slug ? `Unknown merchant "${slug}".` : "No merchant yet. Run `npm run db:seed` or register at /register.");
    merchantId = m.id;
    console.log(`Creating a new owner account for merchant ${m.slug}.`);
  }
  const admin = existing
    ? await prisma.adminUser.update({ where: { email }, data: { passwordHash } })
    : await prisma.adminUser.create({ data: { email, name: "Owner", passwordHash, merchantId: merchantId! } });
  await prisma.adminSession.deleteMany({ where: { adminUserId: admin.id } });

  const ok = await verifyPassword(password, admin.passwordHash);
  console.log(`✓ Admin ${email} ready (password length ${password.length}, verified: ${ok}).`);

  const all = await prisma.adminUser.findMany({ select: { email: true, merchant: { select: { slug: true } } } });
  console.log(`Owner accounts in database: ${all.map((a) => `${a.email} (${a.merchant.slug})`).join(", ")}`);
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
