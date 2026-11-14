/**
 * Seed data: a demo café merchant with headquarters and two branches.
 *   npm run db:seed
 *
 * - Always: ensures a merchant ("Kopi & Co.", /s/kopi-co/hq when the database
 *   has none), its settings and the owner account (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD).
 * - Only on an empty catalog: categories, ingredients (stock per branch, with
 *   opening-stock movements), menu items with recipes, floor plan, the demo
 *   branches, and sample orders placed through the real order service so stock
 *   deductions and movements are genuine.
 * Order history: `npm run demo:branches`.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { hashPassword } from "../lib/auth/password";
import { installSampleCatalog } from "../lib/sample-catalog";
import { DEMO_HOURS } from "../scripts/demo-catalog";
import { ensureDemoBranches, placeOpenOrders, placeSampleOrders } from "../scripts/lib/demo-tenants";
import { requireCurrentClient } from "../scripts/lib/client-check";

async function main() {
  requireCurrentClient();

  // Demo merchant (headquarters) + owner account.
  let merchant = await prisma.merchant.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true, slug: true, name: true } });
  if (!merchant) {
    merchant = await prisma.merchant.create({ data: { slug: "kopi-co", name: "Kopi & Co." }, select: { id: true, slug: true, name: true } });
    await prisma.branch.create({ data: { merchantId: merchant.id, slug: "hq", name: "Headquarters", isHeadquarters: true } });
    console.log(`✓ Merchant ${merchant.name} (/s/${merchant.slug}/hq)`);
  } else {
    console.log(`• Merchant exists: ${merchant.name} (${merchant.slug})`);
  }
  await prisma.storeSetting.upsert({
    where: { merchantId: merchant.id },
    create: { merchantId: merchant.id, storeName: merchant.name, ...DEMO_HOURS, timezone: "Asia/Kuala_Lumpur" },
    update: {},
  });

  const email = (process.env.SEED_ADMIN_EMAIL ?? "admin@example.com").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? "change-me-please";
  const existingAdmin = await prisma.adminUser.findUnique({ where: { email } });
  if (!existingAdmin) {
    await prisma.adminUser.create({ data: { merchantId: merchant.id, email, name: "Owner", passwordHash: await hashPassword(password) } });
    console.log(`✓ Owner account created: ${email}`);
  } else {
    console.log(`• Owner account exists: ${email} (password unchanged)`);
  }

  if ((await prisma.ingredient.count({ where: { merchantId: merchant.id } })) > 0) {
    console.log("• Catalog already present — skipping menu, ingredients and sample orders.");
    console.log("  For demo branches with order data run: npm run demo:branches");
    return;
  }

  const hq = await prisma.branch.findFirstOrThrow({ where: { merchantId: merchant.id, isHeadquarters: true }, select: { id: true } });
  const r = await installSampleCatalog(merchant.id, { actor: "seed" });
  console.log(`✓ ${r.categories} categories, ${r.ingredients} ingredients, ${r.menuItems} menu items with recipes, sample floor plan`);

  const branches = await ensureDemoBranches(merchant.id);
  if (branches.length) console.log(`✓ Demo branches: ${branches.join(", ")} (shared menu, own stock)`);

  await placeSampleOrders(hq.id);
  for (const [i, b] of (await prisma.branch.findMany({ where: { merchantId: merchant.id, isHeadquarters: false } })).entries()) {
    await placeOpenOrders(b.id, 4, i + 2);
  }
  console.log("✓ Sample orders at every branch");
  console.log("  Order history: npm run demo:branches (90 days per branch) or npm run demo:history");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
