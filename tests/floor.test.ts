import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import {
  chairSpots,
  computeFloorStatus,
  formatAge,
  heatColor,
  normalizeTableNumber,
  orderHeat,
  type FloorObjectData,
  type FloorOrder,
} from "@/lib/floor";
import { SAMPLE_LAYOUT } from "@/lib/floor-sample";
import { createSampleLayout, getFloorData, saveFloorLayout } from "@/lib/services/floor";
import { createOrder, updateOrderStatus } from "@/lib/services/orders";
import { floorLayoutSchema } from "@/lib/validation";
import { orderInput, resetDb, seedBurgerScenario } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const table = (id: string, n: string, extra: Partial<FloorObjectData> = {}): FloorObjectData => ({
  id,
  kind: "TABLE",
  label: `Table ${n}`,
  tableNumber: n,
  seats: 4,
  shape: "RECT",
  x: 0,
  z: 0,
  width: 0.9,
  depth: 0.9,
  rotation: 0,
  ...extra,
});
const order = (id: string, tableNumber: string | null, minutesAgo: number, now: number): FloorOrder => ({
  id,
  orderNumber: 1,
  customerName: "x",
  tableNumber,
  status: "PENDING",
  paymentStatus: "UNPAID",
  createdAt: new Date(now - minutesAgo * 60_000).toISOString(),
  totalAmount: "10.00",
  items: [],
});

describe("table numbers", () => {
  it("normalises common ways of writing a table number", () => {
    for (const v of ["5", "05", "T5", "t05", "T 5", "Table 5", "table5", "Meja 5", "No. 5"]) expect(normalizeTableNumber(v)).toBe("5");
    expect(normalizeTableNumber("A3")).toBe("a3");
    expect(normalizeTableNumber("Terrace 1")).toBe("terrace1"); // a leading "t" is only dropped before digits
    expect(normalizeTableNumber("  ")).toBeNull();
    expect(normalizeTableNumber(null)).toBeNull();
  });
});

describe("floor status", () => {
  const now = Date.parse("2026-11-15T04:00:00Z");
  const objects: FloorObjectData[] = [
    table("t5", "5"),
    table("t6", "6"),
    table("t9", "9"),
    { ...table("pass", "x"), kind: "PASS", tableNumber: null, seats: null, label: "Pickup point" },
  ];

  it("matches orders to tables, keeps the oldest age, and separates takeaway and unknown tables", () => {
    const st = computeFloorStatus(
      objects,
      [order("a", "T05", 3, now), order("b", "9", 30, now), order("c", "9", 2, now), order("d", null, 7, now), order("e", "15", 4, now)],
      now,
      20,
    );
    expect(st.byObject.get("t5")!.orders).toHaveLength(1);
    expect(st.byObject.get("t6")!.heat).toBeNull();
    expect(st.byObject.get("t9")!.orders).toHaveLength(2);
    expect(Math.round(st.byObject.get("t9")!.oldestMs! / 60_000)).toBe(30);
    expect(st.byObject.get("t9")!.heat).toBeCloseTo(1.5);
    expect(st.byObject.get("pass")!.orders.map((o) => o.id)).toEqual(["d"]);
    expect(st.unknown.map((u) => u.tableNumber)).toEqual(["15"]);
    expect([st.tables, st.occupied, st.overdue]).toEqual([3, 2, 1]);
  });

  it("colours free green, then yellow → red as an order waits", () => {
    expect(heatColor(null).toLowerCase()).toBe("#5e9c76");
    expect(heatColor(0)).not.toBe(heatColor(1));
    expect(heatColor(1)).toBe(heatColor(5)); // capped at the alert time
    expect(orderHeat(10 * 60_000, 20)).toBeCloseTo(0.5);
    expect([formatAge(30_000), formatAge(7 * 60_000), formatAge(65 * 60_000), formatAge(50 * 3600_000)]).toEqual(["now", "7m", "1h 05m", "2d"]);
  });

  it("places the right number of chairs around tables", () => {
    for (const seats of [1, 2, 4, 6, 8]) {
      expect(chairSpots({ shape: "RECT", width: 1.8, depth: 0.9, seats })).toHaveLength(seats);
      expect(chairSpots({ shape: "ROUND", width: 1, depth: 1, seats })).toHaveLength(seats);
    }
    const four = chairSpots({ shape: "RECT", width: 0.9, depth: 0.9, seats: 4 });
    // every chair faces the table centre
    for (const c of four) expect(Math.abs(Math.atan2(-c.x, -c.z) - c.facing)).toBeLessThan(1e-9);
  });
});

describe("layout validation", () => {
  const base = { floorWidth: 10, floorDepth: 8 };

  it("rejects duplicate table numbers (after normalising) and tables without a number", () => {
    const dup = floorLayoutSchema.safeParse({ ...base, objects: [table("a", "5"), table("b", "T05")] });
    expect(dup.success).toBe(false);
    const missing = floorLayoutSchema.safeParse({ ...base, objects: [table("a", "")] });
    expect(missing.success).toBe(false);
  });

  it("rejects objects outside the floor", () => {
    expect(floorLayoutSchema.safeParse({ ...base, objects: [table("a", "1", { x: 6 })] }).success).toBe(false);
    expect(floorLayoutSchema.safeParse({ ...base, objects: [table("a", "1", { x: 4.9, z: -3.9 })] }).success).toBe(true);
  });
});

describe("floor services", () => {
  it("creates the sample layout once, and saving replaces it with normalised table numbers", async () => {
    const r = await createSampleLayout();
    expect(r.objects).toBe(SAMPLE_LAYOUT.length);
    await expect(createSampleLayout()).rejects.toThrow(/already exists/);

    const before = await prisma.floorObject.findMany({ orderBy: { sortOrder: "asc" } });
    const keep = before.find((o) => o.tableNumber === "1")!;
    await saveFloorLayout(
      floorLayoutSchema.parse({
        floorWidth: 12,
        floorDepth: 9,
        objects: [
          { ...keep, x: 1, z: 1 },
          { kind: "TABLE", label: "Window", tableNumber: "T07", seats: 2, shape: "ROUND", x: -2, z: 0, width: 0.7, depth: 0.7, rotation: -90 },
        ],
      }),
    );
    const after = await prisma.floorObject.findMany({ orderBy: { sortOrder: "asc" } });
    expect(after).toHaveLength(2);
    expect(after[0].id).toBe(keep.id); // existing ids are kept
    expect(after[1].tableNumber).toBe("7");
    expect(after[1].rotation).toBe(270); // stored as 0–359
    const s = await prisma.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
    expect([s.floorWidth, s.floorDepth]).toEqual([12, 9]);
  });

  it("returns only open, real orders for the live view", async () => {
    const s = await seedBurgerScenario();
    const open = await createOrder({ ...orderInput([{ menuItemId: s.burger.id, quantity: 1 }]), tableNumber: "5" });
    const done = await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 1 }]));
    await updateOrderStatus(done.id, "COMPLETED");
    await prisma.order.create({
      data: { customerName: "sim", totalAmount: "1", idempotencyKey: "sim-x", requestHash: "x", isSimulated: true, status: "PENDING" },
    });
    const data = await getFloorData();
    expect(data.orders.map((o) => o.id)).toEqual([open.id]);
    expect(data.orders[0].items[0]).toEqual({ name: "Chicken Burger", quantity: 1 });
    expect(data.alertMinutes).toBe(20);
  });
});
