import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import type { BaseUnit } from "@/lib/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { dbSchema } from "@/lib/db-schema";

export const D = (v: string | number) => new Prisma.Decimal(v);

/** The merchant + headquarters branch every test runs in (recreated by resetDb). */
export const T = { merchantId: "", branchId: "" };

export async function resetDb() {
  const tables = [
    "floor_objects", "expenses", "sold_out_events", "daily_prep", "branch_menu_items", "ingredient_stocks",
    "inventory_movements", "order_ingredients", "order_items", "orders",
    "menu_item_ingredients", "menu_items", "categories", "ingredients",
    "admin_sessions", "admin_users", "store_settings", "branches", "merchants",
  ].map((t) => `"${dbSchema()}"."${t}"`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
  const t = await createTenant("test-cafe", "Test Café");
  T.merchantId = t.merchantId;
  T.branchId = t.branchId;
}

/** A merchant with settings and a headquarters branch. */
export async function createTenant(slug: string, name: string) {
  const m = await prisma.merchant.create({ data: { slug, name } });
  await prisma.storeSetting.create({ data: { merchantId: m.id, storeName: name } });
  const b = await prisma.branch.create({ data: { merchantId: m.id, slug: "hq", name: "Headquarters", isHeadquarters: true } });
  return { merchantId: m.id, branchId: b.id };
}

export async function addBranch(slug: string, name = slug, merchantId = T.merchantId) {
  return prisma.branch.create({ data: { merchantId, slug, name } });
}

/** Catalog ingredient for the test merchant with stock at the given branch (default: HQ). */
export async function createIngredient(data: {
  name: string;
  unit: BaseUnit;
  sku?: string | null;
  currentStock?: Prisma.Decimal | number | string;
  lowStockThreshold?: Prisma.Decimal | number | string;
  costPerUnit?: Prisma.Decimal | null;
  isActive?: boolean;
  merchantId?: string;
  branchId?: string;
}) {
  const { currentStock = 0, lowStockThreshold = 0, merchantId = T.merchantId, branchId = T.branchId, ...rest } = data;
  const ing = await prisma.ingredient.create({ data: { merchantId, ...rest } });
  await prisma.ingredientStock.create({
    data: { branchId, ingredientId: ing.id, currentStock: D(currentStock.toString()), lowStockThreshold: D(lowStockThreshold.toString()) },
  });
  return ing;
}

export async function setStock(ingredientId: string, value: number | string, branchId = T.branchId) {
  await prisma.ingredientStock.upsert({
    where: { branchId_ingredientId: { branchId, ingredientId } },
    update: { currentStock: D(value) },
    create: { branchId, ingredientId, currentStock: D(value) },
  });
}

/** The Chicken Burger scenario from the specification. */
export async function seedBurgerScenario() {
  const category = await prisma.category.create({ data: { merchantId: T.merchantId, name: "Burgers" } });
  const [bun, patty, lettuce, mayo] = await Promise.all([
    createIngredient({ name: "Burger Bun", unit: "PCS", currentStock: 20, lowStockThreshold: 5 }),
    createIngredient({ name: "Chicken Patty", unit: "PCS", currentStock: 15, lowStockThreshold: 5 }),
    createIngredient({ name: "Lettuce", unit: "G", currentStock: 1000, lowStockThreshold: 200 }),
    createIngredient({ name: "Mayonnaise", unit: "G", currentStock: 500, lowStockThreshold: 100 }),
  ]);
  const burger = await prisma.menuItem.create({
    data: {
      merchantId: T.merchantId,
      name: "Chicken Burger",
      price: D("12.90"),
      categoryId: category.id,
      recipe: {
        create: [
          { ingredientId: bun.id, quantityRequired: D(1) },
          { ingredientId: patty.id, quantityRequired: D(1) },
          { ingredientId: lettuce.id, quantityRequired: D(30) },
          { ingredientId: mayo.id, quantityRequired: D(20) },
        ],
      },
    },
  });
  return { category, bun, patty, lettuce, mayo, burger };
}

/** Stock of an ingredient at a branch (default: HQ), as a string; "0" when never stocked there. */
export async function stockOf(id: string, branchId = T.branchId) {
  const s = await prisma.ingredientStock.findUnique({ where: { branchId_ingredientId: { branchId, ingredientId: id } } });
  return (s?.currentStock ?? D(0)).toString();
}

export function orderInput(items: { menuItemId: string; quantity: number }[], key = randomUUID()) {
  return { customerName: "Aisyah", tableNumber: "T3", idempotencyKey: key, items };
}
