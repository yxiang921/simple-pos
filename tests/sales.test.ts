import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createOrder, cancelOrder } from "@/lib/services/orders";
import { dailyRows, resolvePeriod, salesReport } from "@/lib/services/sales";
import { addDays, localDate } from "@/lib/time";
import { addBranch, orderInput, resetDb, seedBurgerScenario, setStock, T } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const TZ = "Asia/Kuala_Lumpur";

describe("periods", () => {
  const today = "2026-11-14"; // a Saturday
  it("resolves presets and the period they are compared with", () => {
    expect(resolvePeriod("yesterday", today)).toMatchObject({ current: { from: "2026-11-13", to: "2026-11-13" }, previous: { from: "2026-11-06" }, granularity: "hour" });
    expect(resolvePeriod("this-week", today)).toMatchObject({ current: { from: "2026-11-09", to: today }, previous: { from: "2026-11-02", to: "2026-11-07" } });
    expect(resolvePeriod("last-week", today)).toMatchObject({ current: { from: "2026-11-02", to: "2026-11-08" }, previous: { from: "2026-10-26", to: "2026-11-01" }, granularity: "day" });
    expect(resolvePeriod("last-month", today)).toMatchObject({ current: { from: "2026-10-01", to: "2026-10-31" }, previous: { from: "2026-09-01", to: "2026-09-30" } });
    expect(resolvePeriod("this-month", today)).toMatchObject({ current: { from: "2026-11-01", to: today }, previous: { from: "2026-10-01", to: "2026-10-14" } });
    expect(resolvePeriod("last-30", today)).toMatchObject({ current: { from: "2026-10-16", to: today }, previous: { from: "2026-09-16", to: "2026-10-15" } });
    expect(resolvePeriod("last-year", today)).toMatchObject({ current: { from: "2025-01-01", to: "2025-12-31" }, granularity: "month" });
    expect(resolvePeriod("nonsense", today).key).toBe("last-7");
  });

  it("custom ranges are clamped to today, swapped if reversed, and compared with the same length before", () => {
    const p = resolvePeriod("custom", today, { from: "2026-11-20", to: "2026-11-10" });
    expect(p.current).toEqual({ from: "2026-11-10", to: today });
    expect(p.previous).toEqual({ from: "2026-11-05", to: "2026-11-09" });
    expect(resolvePeriod("custom", today, { from: "bad", to: "" }).current).toEqual({ from: "2026-11-08", to: today });
  });
});

describe("sales report", () => {
  it("totals, series, top items and branches; cancelled orders excluded", async () => {
    const s = await seedBurgerScenario();
    const other = await addBranch("skudai");
    for (const id of [s.bun.id, s.patty.id, s.lettuce.id, s.mayo.id]) await setStock(id, 1000, other.id);
    await createOrder(T.branchId, orderInput([{ menuItemId: s.burger.id, quantity: 2 }])); // 25.80
    await createOrder(other.id, orderInput([{ menuItemId: s.burger.id, quantity: 1 }])); // 12.90
    const c = await createOrder(T.branchId, orderInput([{ menuItemId: s.burger.id, quantity: 1 }]));
    await cancelOrder(c.id, "test");

    const today = localDate(new Date(), TZ);
    const all = await salesReport({ merchantId: T.merchantId }, resolvePeriod("today", today), TZ);
    expect(all.totals).toEqual({ revenue: 38.7, orders: 2, cancelled: 1, items: 3 });
    expect(all.series).toHaveLength(24);
    expect(all.series.reduce((x, p) => x + p.value, 0)).toBeCloseTo(38.7);
    expect(all.topItems[0]).toMatchObject({ name: "Chicken Burger", qty: 3, share: 1 });
    expect(all.byBranch.get(other.id)).toEqual({ revenue: 12.9, orders: 1 });
    expect(all.change.revenue).toBeNull(); // nothing last week

    const hq = await salesReport({ merchantId: T.merchantId, branchId: T.branchId }, resolvePeriod("last-7", today), TZ);
    expect(hq.totals.revenue).toBe(25.8);
    expect(hq.series).toHaveLength(7);

    const rows = await dailyRows({ merchantId: T.merchantId }, { from: addDays(today, -2), to: today }, TZ);
    expect(rows.map((r) => r.orders)).toEqual([0, 0, 2]);
    expect(rows[2]).toMatchObject({ revenue: 38.7, cancelled: 1 });
  });

  it("never includes another merchant's orders", async () => {
    const { createTenant } = await import("./helpers");
    const s = await seedBurgerScenario();
    await createOrder(T.branchId, orderInput([{ menuItemId: s.burger.id, quantity: 1 }]));
    const other = await createTenant("other", "Other");
    const r = await salesReport({ merchantId: other.merchantId }, resolvePeriod("today", localDate(new Date(), TZ)), TZ);
    expect(r.totals.orders).toBe(0);
  });
});
