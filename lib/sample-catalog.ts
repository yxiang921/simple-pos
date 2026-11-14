// Used by the app (sign-up) and by scripts (seed, demo data) — no "server-only" import.
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { costPerBaseUnit } from "@/lib/units";
import { createSampleLayout } from "@/lib/services/floor";
import { DEMO_COSTS, DEMO_HOURS, DEMO_MENU } from "@/scripts/demo-catalog";

/**
 * Sample café catalog (a small Malaysian kopitiam menu). Used by `npm run
 * db:seed`, by demo data, and when a new merchant ticks "Start with a sample
 * menu" at sign-up. Costs and demand figures are illustrative.
 */

const D = (v: string | number) => new Prisma.Decimal(v);

export type SampleUnit = "PCS" | "G" | "ML";
export const SAMPLE_INGREDIENTS: { name: string; sku: string; unit: SampleUnit; stock: number; low: number }[] = [
  { name: "Rice (uncooked)", sku: "DRY-RICE", unit: "G", stock: 20000, low: 4000 },
  { name: "Coconut Milk", sku: "LIQ-SANTAN", unit: "ML", stock: 6000, low: 1500 },
  { name: "Sambal", sku: "SAU-SAMBAL", unit: "G", stock: 3000, low: 800 },
  { name: "Ikan Bilis", sku: "DRY-BILIS", unit: "G", stock: 2000, low: 400 },
  { name: "Roasted Peanuts", sku: "DRY-PNUT", unit: "G", stock: 2000, low: 400 },
  { name: "Egg", sku: "FRS-EGG", unit: "PCS", stock: 150, low: 30 },
  { name: "Cucumber", sku: "VEG-CUKE", unit: "G", stock: 3000, low: 500 },
  { name: "Chicken Thigh", sku: "MEA-CTHIGH", unit: "G", stock: 9000, low: 2000 },
  { name: "Chicken Patty", sku: "FRZ-CPATTY", unit: "PCS", stock: 40, low: 10 },
  { name: "Burger Bun", sku: "BAK-BUN", unit: "PCS", stock: 40, low: 10 },
  { name: "Lettuce", sku: "VEG-LETT", unit: "G", stock: 2000, low: 400 },
  { name: "Mayonnaise", sku: "SAU-MAYO", unit: "G", stock: 1500, low: 300 },
  { name: "French Fries", sku: "FRZ-FRIES", unit: "G", stock: 6000, low: 1500 },
  { name: "Yellow Noodles", sku: "NOO-YELLOW", unit: "G", stock: 5000, low: 1000 },
  { name: "Kway Teow", sku: "NOO-KWAYT", unit: "G", stock: 4000, low: 1000 },
  { name: "Prawns", sku: "SEA-PRAWN", unit: "G", stock: 420, low: 500 }, // deliberately low
  { name: "Bean Sprouts", sku: "VEG-TAUGE", unit: "G", stock: 2000, low: 400 },
  { name: "Soy Sauce", sku: "SAU-SOY", unit: "ML", stock: 3000, low: 500 },
  { name: "White Bread Slice", sku: "BAK-BREAD", unit: "PCS", stock: 80, low: 20 },
  { name: "Kaya", sku: "SPR-KAYA", unit: "G", stock: 2000, low: 400 },
  { name: "Butter", sku: "DAI-BUTTER", unit: "G", stock: 2000, low: 400 },
  { name: "Roti Canai Dough", sku: "FRZ-ROTI", unit: "PCS", stock: 50, low: 15 },
  { name: "Dhal Curry", sku: "SAU-DHAL", unit: "ML", stock: 6000, low: 1500 },
  { name: "Tea Powder", sku: "BEV-TEA", unit: "G", stock: 2000, low: 300 },
  { name: "Coffee Powder", sku: "BEV-KOPI", unit: "G", stock: 2000, low: 300 },
  { name: "Condensed Milk", sku: "DAI-CONDM", unit: "ML", stock: 5000, low: 1000 },
  { name: "Evaporated Milk", sku: "DAI-EVAPM", unit: "ML", stock: 5000, low: 1000 },
  { name: "Sugar", sku: "DRY-SUGAR", unit: "G", stock: 5000, low: 1000 },
  { name: "Milo Powder", sku: "BEV-MILO", unit: "G", stock: 2500, low: 500 },
  { name: "Calamansi Lime", sku: "FRT-LIMAU", unit: "PCS", stock: 12, low: 20 }, // deliberately low
  { name: "Cendol Jelly", sku: "DES-CENDOL", unit: "G", stock: 3000, low: 600 },
  { name: "Gula Melaka Syrup", sku: "DES-GULAM", unit: "ML", stock: 2000, low: 400 },
  { name: "Red Beans", sku: "DES-REDBN", unit: "G", stock: 2000, low: 400 },
  { name: "Mineral Water 500ml", sku: "BEV-WATER", unit: "PCS", stock: 48, low: 12 },
];

export const SAMPLE_CATEGORIES = [
  { name: "Rice & Noodles", sortOrder: 10 },
  { name: "Burgers & Sides", sortOrder: 20 },
  { name: "Breakfast", sortOrder: 30 },
  { name: "Drinks", sortOrder: 40 },
  { name: "Desserts", sortOrder: 50 },
];

const NASI_LEMAK_BASE: [string, number][] = [
  ["Rice (uncooked)", 150],
  ["Coconut Milk", 40],
  ["Sambal", 40],
  ["Ikan Bilis", 15],
  ["Roasted Peanuts", 15],
  ["Egg", 1],
  ["Cucumber", 20],
];

export const SAMPLE_MENU: { name: string; category: string; price: string; description: string; recipe: [string, number][] }[] = [
  {
    name: "Nasi Lemak Ayam Goreng",
    category: "Rice & Noodles",
    price: "14.90",
    description: "Coconut rice with crispy fried chicken thigh, sambal, ikan bilis, peanuts, egg and cucumber.",
    recipe: [...NASI_LEMAK_BASE, ["Chicken Thigh", 180]],
  },
  {
    name: "Nasi Lemak Biasa",
    category: "Rice & Noodles",
    price: "7.50",
    description: "Classic coconut rice with sambal, ikan bilis, peanuts, boiled egg and cucumber.",
    recipe: NASI_LEMAK_BASE,
  },
  {
    name: "Mee Goreng Mamak",
    category: "Rice & Noodles",
    price: "11.90",
    description: "Wok-fried yellow noodles with egg, bean sprouts, chicken and a touch of sambal.",
    recipe: [
      ["Yellow Noodles", 200],
      ["Egg", 1],
      ["Bean Sprouts", 40],
      ["Soy Sauce", 15],
      ["Chicken Thigh", 60],
      ["Sambal", 20],
    ],
  },
  {
    name: "Char Kway Teow",
    category: "Rice & Noodles",
    price: "13.90",
    description: "Flat rice noodles fried over high heat with prawns, egg and bean sprouts.",
    recipe: [
      ["Kway Teow", 200],
      ["Prawns", 60],
      ["Egg", 1],
      ["Bean Sprouts", 40],
      ["Soy Sauce", 20],
    ],
  },
  {
    name: "Chicken Burger",
    category: "Burgers & Sides",
    price: "12.90",
    description: "Grilled chicken patty, fresh lettuce and mayonnaise in a toasted bun.",
    recipe: [
      ["Burger Bun", 1],
      ["Chicken Patty", 1],
      ["Lettuce", 30],
      ["Mayonnaise", 20],
    ],
  },
  {
    name: "Chicken Burger Combo",
    category: "Burgers & Sides",
    price: "16.90",
    description: "Chicken burger served with a side of fries.",
    recipe: [
      ["Burger Bun", 1],
      ["Chicken Patty", 1],
      ["Lettuce", 30],
      ["Mayonnaise", 20],
      ["French Fries", 150],
    ],
  },
  {
    name: "French Fries",
    category: "Burgers & Sides",
    price: "6.90",
    description: "Crispy shoestring fries.",
    recipe: [["French Fries", 150]],
  },
  {
    name: "Roti Bakar Kaya",
    category: "Breakfast",
    price: "5.50",
    description: "Charcoal-toasted bread with house kaya and cold butter.",
    recipe: [
      ["White Bread Slice", 2],
      ["Kaya", 30],
      ["Butter", 15],
    ],
  },
  {
    name: "Half-Boiled Eggs (2)",
    category: "Breakfast",
    price: "4.00",
    description: "Two soft eggs with soy sauce and white pepper.",
    recipe: [
      ["Egg", 2],
      ["Soy Sauce", 5],
    ],
  },
  {
    name: "Roti Canai with Dhal",
    category: "Breakfast",
    price: "3.50",
    description: "Flaky flatbread served with dhal curry.",
    recipe: [
      ["Roti Canai Dough", 1],
      ["Dhal Curry", 120],
    ],
  },
  {
    name: "Teh Tarik",
    category: "Drinks",
    price: "3.80",
    description: "Pulled milk tea, hot or iced.",
    recipe: [
      ["Tea Powder", 8],
      ["Condensed Milk", 30],
      ["Evaporated Milk", 20],
    ],
  },
  {
    name: "Kopi O",
    category: "Drinks",
    price: "2.80",
    description: "Traditional black coffee with sugar.",
    recipe: [
      ["Coffee Powder", 10],
      ["Sugar", 15],
    ],
  },
  {
    name: "Milo Ais",
    category: "Drinks",
    price: "4.50",
    description: "Iced chocolate malt drink.",
    recipe: [
      ["Milo Powder", 30],
      ["Condensed Milk", 20],
      ["Evaporated Milk", 20],
    ],
  },
  {
    name: "Limau Ais",
    category: "Drinks",
    price: "3.50",
    description: "Fresh calamansi lime juice over ice.",
    recipe: [
      ["Calamansi Lime", 2],
      ["Sugar", 20],
    ],
  },
  {
    name: "Mineral Water",
    category: "Drinks",
    price: "1.50",
    description: "500ml bottle.",
    recipe: [["Mineral Water 500ml", 1]],
  },
  {
    name: "Cendol",
    category: "Desserts",
    price: "6.50",
    description: "Shaved ice with pandan jelly, red beans, coconut milk and gula melaka.",
    recipe: [
      ["Cendol Jelly", 60],
      ["Gula Melaka Syrup", 40],
      ["Coconut Milk", 60],
      ["Red Beans", 30],
    ],
  },
];

export { DEMO_HOURS };

/**
 * Install the sample categories, ingredients (with costs), menu + recipes and
 * floor plan for a merchant that has no catalog yet. Every branch gets the
 * opening stock × its `stockScale` (default 1) with an INITIAL movement.
 */
export async function installSampleCatalog(
  merchantId: string,
  opts: { stockScale?: Record<string, number>; floorPlan?: boolean; actor?: string } = {},
) {
  if (await prisma.ingredient.count({ where: { merchantId } })) throw new Error("This merchant already has ingredients.");
  const branches = await prisma.branch.findMany({ where: { merchantId }, select: { id: true } });
  const actor = opts.actor ?? "sample";

  await prisma.$transaction(
    async (tx) => {
      const cats = new Map<string, string>();
      for (const c of SAMPLE_CATEGORIES) cats.set(c.name, (await tx.category.create({ data: { merchantId, ...c } })).id);

      const ings = new Map<string, string>();
      for (const i of SAMPLE_INGREDIENTS) {
        const row = await tx.ingredient.create({
          data: {
            merchantId,
            name: i.name,
            sku: i.sku,
            unit: i.unit,
            costPerUnit: DEMO_COSTS[i.sku]
              ? costPerBaseUnit(DEMO_COSTS[i.sku], i.unit === "G" ? "kg" : i.unit === "ML" ? "L" : "pcs", i.unit)
              : null,
          },
        });
        ings.set(i.name, row.id);
        for (const b of branches) {
          const stock = D(Math.round(i.stock * (opts.stockScale?.[b.id] ?? 1)));
          await tx.ingredientStock.create({
            data: { branchId: b.id, ingredientId: row.id, currentStock: stock, lowStockThreshold: D(i.low) },
          });
          if (stock.gt(0)) {
            await tx.inventoryMovement.create({
              data: {
                branchId: b.id,
                ingredientId: row.id,
                movementType: "INITIAL",
                quantityChange: stock,
                balanceAfter: stock,
                reason: "Opening stock",
                createdBy: actor,
              },
            });
          }
        }
      }

      for (const m of SAMPLE_MENU) {
        await tx.menuItem.create({
          data: {
            merchantId,
            name: m.name,
            description: m.description,
            price: D(m.price),
            categoryId: cats.get(m.category)!,
            isPreparedAhead: DEMO_MENU[m.name]?.preparedAhead ?? null,
            aliases: DEMO_MENU[m.name]?.aliases ?? [],
            recipe: {
              create: m.recipe.map(([ing, qty]) => {
                const ingredientId = ings.get(ing);
                if (!ingredientId) throw new Error(`Unknown ingredient in sample recipe: ${ing}`);
                return { ingredientId, quantityRequired: D(qty) };
              }),
            },
          },
        });
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  if (opts.floorPlan !== false && (await prisma.floorObject.count({ where: { merchantId } })) === 0) {
    await createSampleLayout(merchantId);
  }
  return { categories: SAMPLE_CATEGORIES.length, ingredients: SAMPLE_INGREDIENTS.length, menuItems: SAMPLE_MENU.length };
}
