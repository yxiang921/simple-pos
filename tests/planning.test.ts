import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { dbSchema } from "@/lib/db-schema";
import { createIngredient, updateIngredient } from "@/lib/services/inventory";
import { deleteMenuItem, saveMenuItem, setMenuItemAvailability } from "@/lib/services/menu";
import { createOrder } from "@/lib/services/orders";
import { getPrepSheet, savePrep } from "@/lib/services/prep";
import { dayRangeUtc, localDate, zonedTimeToUtc } from "@/lib/time";
import { dailyPrepSchema, storeSettingsSchema } from "@/lib/validation";
import { orderInput, resetDb, seedBurgerScenario } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("sold-out events", () => {
  it("records one event when an item is switched off, none when switched on or repeated", async () => {
    const s = await seedBurgerScenario();
    await setMenuItemAvailability(s.burger.id, false);
    await setMenuItemAvailability(s.burger.id, false); // double click
    await setMenuItemAvailability(s.burger.id, true);
    expect(await prisma.soldOutEvent.count({ where: { menuItemId: s.burger.id } })).toBe(1);

    await Promise.all([1, 2, 3].map(() => setMenuItemAvailability(s.burger.id, false))); // concurrent clicks
    expect(await prisma.soldOutEvent.count({ where: { menuItemId: s.burger.id } })).toBe(2);
  });

  it("records an event when the edit form turns availability off", async () => {
    const s = await seedBurgerScenario();
    const base = {
      name: "Chicken Burger",
      description: "",
      price: "12.90",
      categoryId: s.category.id,
      imageUrl: null,
      isPreparedAhead: false,
      aliases: ["burger"],
      recipe: [],
    };
    await saveMenuItem(s.burger.id, { ...base, isAvailable: false });
    await saveMenuItem(s.burger.id, { ...base, isAvailable: false }); // already off → no new event
    expect(await prisma.soldOutEvent.count()).toBe(1);
    const item = await prisma.menuItem.findUniqueOrThrow({ where: { id: s.burger.id } });
    expect(item.isPreparedAhead).toBe(false);
    expect(item.aliases).toEqual(["burger"]);
  });

  it("archives (not deletes) items that have sold-out or prep history", async () => {
    const s = await seedBurgerScenario();
    await setMenuItemAvailability(s.burger.id, false);
    expect(await deleteMenuItem(s.burger.id)).toBe("archived");
  });
});

describe("daily prep", () => {
  it("upserts plates, removes blank entries, and reports sold vs prepared", async () => {
    const s = await seedBurgerScenario();
    const today = localDate(new Date());
    await savePrep(today, [{ menuItemId: s.burger.id, plates: 10 }]);
    await savePrep(today, [{ menuItemId: s.burger.id, plates: 12 }]);
    expect(await prisma.dailyPrep.count()).toBe(1);

    await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 3 }]));
    let sheet = await getPrepSheet(today);
    let row = sheet.rows.find((r) => r.menuItemId === s.burger.id)!;
    expect(row.platesPrepared).toBe(12);
    expect(row.sold).toBe(3);

    await savePrep(today, [{ menuItemId: s.burger.id, plates: null }]);
    sheet = await getPrepSheet(today);
    row = sheet.rows.find((r) => r.menuItemId === s.burger.id)!;
    expect(row.platesPrepared).toBeNull();
    expect(await prisma.dailyPrep.count()).toBe(0);
  });

  it("stores the Malaysian calendar date in a DATE column", async () => {
    const s = await seedBurgerScenario();
    await savePrep("2026-11-14", [{ menuItemId: s.burger.id, plates: 5 }]);
    const [row] = await prisma.$queryRawUnsafe<{ d: string }[]>(
      `SELECT date::text AS d FROM "${dbSchema()}"."daily_prep"`,
    );
    expect(row.d).toBe("2026-11-14");
  });

  it("validates plates and dates", () => {
    expect(dailyPrepSchema.safeParse({ date: "2026-11-14", entries: [{ menuItemId: "x", plates: -1 }] }).success).toBe(false);
    expect(dailyPrepSchema.safeParse({ date: "2026-11-14", entries: [{ menuItemId: "x", plates: 2.5 }] }).success).toBe(false);
    expect(dailyPrepSchema.safeParse({ date: "14/11/2026", entries: [] }).success).toBe(false);
    const ok = dailyPrepSchema.parse({ date: "2026-11-14", entries: [{ menuItemId: "x", plates: "" }] });
    expect(ok.entries[0].plates).toBeNull();
  });
});

describe("ingredient cost", () => {
  it("stores RM per base unit (RM 11/kg → 0.011 per g) and null when unknown", async () => {
    const chicken = await createIngredient({
      name: "Chicken",
      sku: null,
      unit: "G",
      initialStock: "0",
      lowStockThreshold: "0",
      cost: "11.00",
      costUnit: "kg",
    });
    expect(chicken!.costPerUnit!.toString()).toBe("0.011");

    const egg = await createIngredient({ name: "Egg", sku: null, unit: "PCS", initialStock: "0", lowStockThreshold: "0", cost: null });
    expect(egg!.costPerUnit).toBeNull();

    await updateIngredient({
      id: chicken!.id,
      name: "Chicken",
      sku: null,
      lowStockThreshold: "0",
      isActive: true,
      cost: "12.50",
      costUnit: "kg",
    });
    const after = await prisma.ingredient.findUniqueOrThrow({ where: { id: chicken!.id } });
    expect(after.costPerUnit!.toString()).toBe("0.0125");
  });

  it("rejects a cost unit that doesn't match the ingredient", async () => {
    await expect(
      createIngredient({ name: "Milk", sku: null, unit: "ML", initialStock: "0", lowStockThreshold: "0", cost: "5", costUnit: "kg" }),
    ).rejects.toThrow(/doesn't match/);
  });
});

describe("store hours & time zones", () => {
  it("validates HH:MM and time zone", () => {
    expect(storeSettingsSchema.safeParse({ storeName: "x", openTime: "7:00" }).success).toBe(false);
    expect(storeSettingsSchema.safeParse({ storeName: "x", timezone: "Mars/Base" }).success).toBe(false);
    const ok = storeSettingsSchema.parse({ storeName: "x", openTime: "07:00", closeTime: "", timezone: "" });
    expect(ok).toMatchObject({ openTime: "07:00", closeTime: null, timezone: "Asia/Kuala_Lumpur" });
  });

  it("converts Malaysian local times to UTC", () => {
    expect(zonedTimeToUtc("2026-11-14", "07:00").toISOString()).toBe("2026-11-13T23:00:00.000Z");
    const { start, end } = dayRangeUtc("2026-11-14");
    expect(start.toISOString()).toBe("2026-11-13T16:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-14T16:00:00.000Z");
    expect(localDate(new Date("2026-11-13T16:30:00Z"))).toBe("2026-11-14");
  });
});
