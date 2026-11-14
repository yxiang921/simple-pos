import { randomUUID } from "node:crypto";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { dbSchema } from "@/lib/db-schema";

export const D = (v: string | number) => new Prisma.Decimal(v);

export async function resetDb() {
  const tables = [
    "floor_objects", "expenses", "sold_out_events", "daily_prep",
    "inventory_movements", "order_ingredients", "order_items", "orders",
    "menu_item_ingredients", "menu_items", "categories", "ingredients",
    "admin_sessions", "admin_users", "store_settings",
  ].map((t) => `"${dbSchema()}"."${t}"`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(", ")} RESTART IDENTITY CASCADE`);
}

/** The Chicken Burger scenario from the specification. */
export async function seedBurgerScenario() {
  const category = await prisma.category.create({ data: { name: "Burgers" } });
  const [bun, patty, lettuce, mayo] = await Promise.all([
    prisma.ingredient.create({ data: { name: "Burger Bun", unit: "PCS", currentStock: D(20), lowStockThreshold: D(5) } }),
    prisma.ingredient.create({ data: { name: "Chicken Patty", unit: "PCS", currentStock: D(15), lowStockThreshold: D(5) } }),
    prisma.ingredient.create({ data: { name: "Lettuce", unit: "G", currentStock: D(1000), lowStockThreshold: D(200) } }),
    prisma.ingredient.create({ data: { name: "Mayonnaise", unit: "G", currentStock: D(500), lowStockThreshold: D(100) } }),
  ]);
  const burger = await prisma.menuItem.create({
    data: {
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

export async function stockOf(id: string) {
  const i = await prisma.ingredient.findUniqueOrThrow({ where: { id } });
  return i.currentStock.toString();
}

export function orderInput(items: { menuItemId: string; quantity: number }[], key = randomUUID()) {
  return { customerName: "Aisyah", tableNumber: "T3", idempotencyKey: key, items };
}
