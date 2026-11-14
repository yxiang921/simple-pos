import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { dbSchema } from "@/lib/db-schema";
import { addDays, localDate } from "@/lib/time";
import {
  dummyAliases,
  dummyCost,
  dummyPreparedAhead,
  fillEmptyFields,
  historyCoverage,
  removeSimulated,
  simulateDays,
} from "../scripts/lib/demo";
import { resetDb, seedBurgerScenario, stockOf } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("dummy-value heuristics", () => {
  it("guesses costs from SKU, name, or unit", () => {
    expect(dummyCost({ name: "Anything", sku: "MEA-CTHIGH", unit: "G" })).toEqual({ perDisplayUnit: "11.00", source: "demo catalog" });
    expect(dummyCost({ name: "Rice (uncooked)", sku: null, unit: "G" }).perDisplayUnit).toBe("3.20"); // not "ice"
    expect(dummyCost({ name: "Fresh Milk", sku: null, unit: "ML" }).perDisplayUnit).toBe("8.00");
    expect(dummyCost({ name: "Mystery Spice", sku: null, unit: "G" })).toEqual({ perDisplayUnit: "10.00", source: "unit default" });
  });

  it("guesses prepared-ahead from the dish, not just the category", () => {
    expect(dummyPreparedAhead("Nasi Lemak Ayam Goreng", "Rice & Noodles")).toBe(true);
    expect(dummyPreparedAhead("Char Kway Teow", "Rice & Noodles")).toBe(false);
    expect(dummyPreparedAhead("Roti John", "Rice & Noodles")).toBe(false);
    expect(dummyPreparedAhead("Nasi Kandar", "Rice & Noodles")).toBe(true);
    expect(dummyPreparedAhead("Iced Latte", "Drinks")).toBe(false);
  });

  it("builds short aliases from names", () => {
    expect(dummyAliases("Iced Latte")).toEqual(["latte", "il"]);
    expect(dummyAliases("Teh Tarik")).toEqual(["teh", "tarik"]); // demo catalog
  });
});

describe("fillEmptyFields", () => {
  it("fills only empty values and is idempotent", async () => {
    const s = await seedBurgerScenario();
    await prisma.ingredient.update({ where: { id: s.patty.id }, data: { costPerUnit: "2.50" } }); // real value

    const first = await fillEmptyFields({ windowDays: 35 });
    const costs = first.fields.filter((f) => f.field === "costPerUnit").map((f) => f.label).sort();
    expect(costs).toEqual(["Burger Bun", "Lettuce", "Mayonnaise"]);
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: s.patty.id } })).costPerUnit!.toString()).toBe("2.5");

    const burger = await prisma.menuItem.findUniqueOrThrow({ where: { id: s.burger.id } });
    expect(burger.isPreparedAhead).toBe(false);
    expect(burger.aliases).toEqual(["burger", "burger ayam"]);
    const store = await prisma.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
    expect([store.openTime, store.closeTime]).toEqual(["07:00", "21:00"]);
    expect(first.insertedExpenseIds.length).toBe(13);
    expect(await prisma.expense.count({ where: { isSimulated: true } })).toBe(13);

    const second = await fillEmptyFields({ windowDays: 35 });
    expect(second.fields).toEqual([]);
    expect(second.insertedExpenseIds).toEqual([]);
  });

  it("adds dummy running costs only for categories that have none", async () => {
    await prisma.expense.create({
      data: { name: "Real rent", category: "RENT", amount: "5200", frequency: "MONTHLY", startDate: new Date("2026-01-01T00:00:00Z") },
    });
    const r = await fillEmptyFields({ windowDays: 35 });
    expect(r.insertedExpenseCategories).not.toContain("RENT");
    expect(await prisma.expense.count({ where: { category: "RENT" } })).toBe(1);
  });
});

describe("simulated history", () => {
  it("simulates only the given days, never changes stock, and can be removed per day", async () => {
    const s = await seedBurgerScenario();
    await fillEmptyFields({ windowDays: 35 });
    const today = localDate(new Date());
    const days = [addDays(today, -2), addDays(today, -1)];

    const r = await simulateDays(days, { windowDays: 35 });
    expect(r.orders).toBeGreaterThan(0);
    expect(await prisma.order.count({ where: { isSimulated: false } })).toBe(0);
    expect(await stockOf(s.patty.id)).toBe("15");
    expect(await prisma.inventoryMovement.count()).toBe(0);

    const cov = await historyCoverage(35, "Asia/Kuala_Lumpur");
    expect(cov.needing).not.toContain(days[0]);
    expect(cov.needing.length).toBe(33);

    const removed = await removeSimulated({ days: [days[0]] });
    expect(removed.orders).toBeGreaterThan(0);
    const after = await historyCoverage(35, "Asia/Kuala_Lumpur");
    expect(after.needing).toContain(days[0]);
    expect(after.needing).not.toContain(days[1]);
  });
});

describe("real-data patterns", () => {
  it("loads the pattern file built from the public datasets", async () => {
    const { loadPatterns } = await import("../scripts/lib/demo");
    const p = loadPatterns();
    expect(p.yaz.days).toBe(760);
    expect(p.yaz.dow.TOTAL[5]).toBeGreaterThan(1.3); // Saturday busy
    expect(p.yaz.dow.TOTAL[6]).toBeLessThan(0.8); // Sunday quiet
    expect(p.indonesia.basket["1"]).toBeGreaterThan(0.8);
    expect(p.malaysia.fb.revenuePerEmployeeDay).toBeGreaterThan(100);
    expect(p.malaysia.arrivals.seasonByMonth[11]).toBeGreaterThan(p.malaysia.arrivals.seasonByMonth[1]); // Dec > Feb
    expect(p.sources.every((s) => s.license === "CC BY 4.0")).toBe(true);
  });

  it("classifies menu items into the dataset's groups and dish profiles", async () => {
    const { itemGroup, yazProfile } = await import("../scripts/lib/demo");
    expect(itemGroup("Teh Tarik", "Drinks")).toBe("drink");
    expect(itemGroup("Roti Canai with Dhal", "Breakfast")).toBe("snack");
    expect(itemGroup("Nasi Lemak Ayam Goreng", "Rice & Noodles")).toBe("main");
    expect(yazProfile("Nasi Lemak Ayam Goreng")).toBe("HAEHNCHEN");
    expect(yazProfile("Char Kway Teow")).toBe("GARNELEN");
    expect(yazProfile("Nasi Lemak Biasa")).toBe("TOTAL");
  });

  it("generated history follows the real weekday shape and is sized from DOSM", async () => {
    await seedBurgerScenario();
    const today = localDate(new Date());
    const days = Array.from({ length: 28 }, (_, i) => addDays(today, -28 + i));
    const r = await simulateDays(days, { windowDays: 365, staff: 3 });
    expect(r.targetRevenuePerDay).toBe(r.staff * 283);
    const rows = await prisma.$queryRawUnsafe<{ dow: number; n: number }[]>(
      `SELECT EXTRACT(ISODOW FROM ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kuala_Lumpur'))::int AS dow, COUNT(*)::int AS n
       FROM "${dbSchema()}"."orders" WHERE is_simulated GROUP BY 1`,
    );
    const by = Object.fromEntries(rows.map((x) => [x.dow, x.n]));
    expect(by[6]).toBeGreaterThan(by[7] * 1.5); // Saturday vs Sunday, as in the Yaz data
    expect(await prisma.order.count({ where: { isSimulated: false } })).toBe(0);
  });
});
