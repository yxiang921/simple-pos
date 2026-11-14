import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { receiveStock } from "@/lib/services/stock-in";
import { localDate, addDays } from "@/lib/time";
import { stockReceiptSchema } from "@/lib/validation";
import { addBranch, createIngredient, resetDb, seedBurgerScenario, stockOf, T } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const TZ = "Asia/Kuala_Lumpur";
const receive = (branchId: string, payload: unknown) => receiveStock(branchId, stockReceiptSchema.parse(payload), "owner@test", TZ);

describe("stock in", () => {
  it("adds several ingredients in one delivery, with movements linked to the receipt", async () => {
    const s = await seedBurgerScenario();
    const r = await receive(T.branchId, {
      supplier: "Pasar Borong",
      reference: "INV-1",
      lines: [
        { ingredientId: s.bun.id, quantity: "24", inputUnit: "pcs", lineCost: "19.20" },
        { ingredientId: s.lettuce.id, quantity: "1.5", inputUnit: "kg", lineCost: "" },
      ],
    });
    expect(await stockOf(s.bun.id)).toBe("44");
    expect(await stockOf(s.lettuce.id)).toBe("2500");
    expect(r.totalCost).toBe("19.20");
    const moves = await prisma.inventoryMovement.findMany({ where: { receiptId: r.id }, orderBy: { ingredientId: "asc" } });
    expect(moves).toHaveLength(2);
    expect(moves.every((m) => m.movementType === "RESTOCK" && m.branchId === T.branchId)).toBe(true);
    expect(moves.find((m) => m.ingredientId === s.lettuce.id)!.balanceAfter.toString()).toBe("2500");
    expect(moves[0].reason).toMatch(/^Stock in #\d+ · Pasar Borong · INV-1$/);
  });

  it("updates the ingredient cost from the line cost (per base unit) unless turned off", async () => {
    const s = await seedBurgerScenario();
    await receive(T.branchId, { lines: [{ ingredientId: s.bun.id, quantity: "20", inputUnit: "pcs", lineCost: "16.00" }] });
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: s.bun.id } })).costPerUnit!.toString()).toBe("0.8");
    await receive(T.branchId, { lines: [{ ingredientId: s.lettuce.id, quantity: "2", inputUnit: "kg", lineCost: "18.00" }] });
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: s.lettuce.id } })).costPerUnit!.toString()).toBe("0.009");
    await receive(T.branchId, { updateCosts: false, lines: [{ ingredientId: s.bun.id, quantity: "10", inputUnit: "pcs", lineCost: "50.00" }] });
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: s.bun.id } })).costPerUnit!.toString()).toBe("0.8");
  });

  it("only touches the receiving branch, creating its stock row if needed", async () => {
    const s = await seedBurgerScenario();
    const other = await addBranch("skudai");
    await receive(other.id, { lines: [{ ingredientId: s.patty.id, quantity: "30", inputUnit: "pcs" }] });
    expect(await stockOf(s.patty.id, other.id)).toBe("30");
    expect(await stockOf(s.patty.id)).toBe("15");
  });

  it("rejects bad input and is all-or-nothing", async () => {
    const s = await seedBurgerScenario();
    expect(stockReceiptSchema.safeParse({ lines: [] }).success).toBe(false);
    expect(
      stockReceiptSchema.safeParse({
        lines: [
          { ingredientId: s.bun.id, quantity: "1", inputUnit: "pcs" },
          { ingredientId: s.bun.id, quantity: "2", inputUnit: "pcs" },
        ],
      }).success,
    ).toBe(false);
    // second line has an incompatible unit → nothing is received
    await expect(
      receive(T.branchId, {
        lines: [
          { ingredientId: s.bun.id, quantity: "5", inputUnit: "pcs" },
          { ingredientId: s.lettuce.id, quantity: "1", inputUnit: "L" },
        ],
      }),
    ).rejects.toThrow(/cannot be used/);
    expect(await stockOf(s.bun.id)).toBe("20");
    expect(await prisma.stockReceipt.count()).toBe(0);
    const tomorrow = addDays(localDate(new Date(), TZ), 1);
    await expect(receive(T.branchId, { receivedDate: tomorrow, lines: [{ ingredientId: s.bun.id, quantity: "1", inputUnit: "pcs" }] })).rejects.toThrow(/future/);
  });

  it("never receives another merchant's ingredient", async () => {
    const { createTenant } = await import("./helpers");
    const other = await createTenant("other", "Other");
    const theirs = await createIngredient({ name: "Flour", unit: "G", merchantId: other.merchantId, branchId: other.branchId });
    await expect(receive(T.branchId, { lines: [{ ingredientId: theirs.id, quantity: "1", inputUnit: "g" }] })).rejects.toThrow(/no longer exists/);
  });
});

describe("stock in — large deliveries", () => {
  it("receives 40 lines in one go with correct balances", async () => {
    const ings = await Promise.all(
      Array.from({ length: 40 }, (_, i) => createIngredient({ name: `Item ${i}`, unit: "G", currentStock: i, lowStockThreshold: 0 })),
    );
    const r = await receive(T.branchId, {
      lines: ings.map((g, i) => ({ ingredientId: g.id, quantity: "1.5", inputUnit: "kg", lineCost: i % 2 ? "3.00" : "" })),
    });
    expect(r.lines).toBe(40);
    expect(r.totalCost).toBe("60.00");
    expect(await stockOf(ings[7].id)).toBe("1507");
    const m = await prisma.inventoryMovement.findFirstOrThrow({ where: { receiptId: r.id, ingredientId: ings[7].id } });
    expect(m.balanceAfter.toString()).toBe("1507");
    expect((await prisma.ingredient.findUniqueOrThrow({ where: { id: ings[1].id } })).costPerUnit!.toString()).toBe("0.002");
  });
});
