/**
 * Create the admin account, or reset its password, from .env:
 *   SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD
 *
 *   npm run admin:password
 *
 * Also signs out all existing sessions for that admin.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { dbSchema } from "../lib/db-schema";
import { hashPassword, verifyPassword } from "../lib/auth/password";

async function main() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env first.");

  console.log(`Schema: ${dbSchema()}`);
  const passwordHash = await hashPassword(password);
  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: { email, name: "Administrator", passwordHash },
    update: { passwordHash },
  });
  await prisma.adminSession.deleteMany({ where: { adminUserId: admin.id } });

  const ok = await verifyPassword(password, admin.passwordHash);
  console.log(`✓ Admin ${email} ready (password length ${password.length}, verified: ${ok}).`);

  const all = await prisma.adminUser.findMany({ select: { email: true } });
  console.log(`Admin accounts in database: ${all.map((a) => a.email).join(", ")}`);
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
