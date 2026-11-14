import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import {
  changeExpenseAmount,
  costOnDay,
  createExpense,
  monthlyEquivalent,
  monthSummary,
  overheadsForRange,
} from "@/lib/services/expenses";
import { createOrder } from "@/lib/services/orders";
import { localDate } from "@/lib/time";
import { expenseSchema } from "@/lib/validation";
import { orderInput, resetDb, seedBurgerScenario } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const D = (v: string | number) => new Prisma.Decimal(v);
const base = { notes: "", endDate: null as string | null };

describe("overhead calculation", () => {
  it("a monthly cost totals exactly its amount for any full month", async () => {
    await createExpense({ ...base, name: "Rent", category: "RENT", amount: "4500.00", frequency: "MONTHLY", startDate: "2026-01-01" });
    for (const [from, to] of [
      ["2026-02-01", "2026-02-28"],
      ["2026-03-01", "2026-03-31"],
      ["2026-04-01", "2026-04-30"],
    ]) {
      const { total } = await overheadsForRange(from, to);
      expect(total.toFixed(2)).toBe("4500.00");
    }
  });

  it("prorates partial months and respects start/end dates", async () => {
    await createExpense({
      ...base,
      name: "Helper",
      category: "STAFF",
      amount: "3000.00",
      frequency: "MONTHLY",
      startDate: "2026-11-16",
      endDate: "2026-12-10",
    });
    expect((await overheadsForRange("2026-11-01", "2026-11-30")).total.toFixed(2)).toBe("1500.00"); // 15/30 days
    expect((await overheadsForRange("2026-12-01", "2026-12-31")).total.toFixed(2)).toBe("967.74"); // 10/31 days
    expect((await overheadsForRange("2027-01-01", "2027-01-31")).total.toFixed(2)).toBe("0.00");
  });

  it("charges one-time costs on their date only, and yearly costs across the year", async () => {
    await createExpense({ ...base, name: "Fridge repair", category: "MAINTENANCE", amount: "850.00", frequency: "ONE_TIME", startDate: "2026-11-20" });
    await createExpense({ ...base, name: "Licence", category: "LICENSES", amount: "365.00", frequency: "YEARLY", startDate: "2026-01-01" });
    const nov = await overheadsForRange("2026-11-01", "2026-11-30");
    expect(nov.byCategory.get("MAINTENANCE")!.toFixed(2)).toBe("850.00");
    expect(nov.byCategory.get("LICENSES")!.toFixed(2)).toBe("30.00");
    expect((await overheadsForRange("2026-12-01", "2026-12-31")).byCategory.get("MAINTENANCE")).toBeUndefined();
  });

  it("monthly equivalents and daily cost", () => {
    expect(monthlyEquivalent(D("100"), "WEEKLY")!.toFixed(2)).toBe("433.33");
    expect(monthlyEquivalent(D("1200"), "YEARLY")!.toFixed(2)).toBe("100.00");
    expect(monthlyEquivalent(D("50"), "ONE_TIME")).toBeNull();
    const e = { amount: D("70"), frequency: "WEEKLY" as const, startDate: "2026-01-01", endDate: null };
    expect(costOnDay(e, "2026-06-01").toFixed(2)).toBe("10.00");
    expect(costOnDay(e, "2025-12-31").toFixed(2)).toBe("0.00");
  });
});

describe("changing an amount from a date", () => {
  it("keeps earlier months at the old amount", async () => {
    const rent = await createExpense({ ...base, name: "Rent", category: "RENT", amount: "4000.00", frequency: "MONTHLY", startDate: "2026-01-01" });
    await changeExpenseAmount(rent.id, "4500.00", "2026-07-01");
    expect((await overheadsForRange("2026-06-01", "2026-06-30")).total.toFixed(2)).toBe("4000.00");
    expect((await overheadsForRange("2026-07-01", "2026-07-31")).total.toFixed(2)).toBe("4500.00");
    const rows = await prisma.expense.findMany({ orderBy: { startDate: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0].endDate!.toISOString().slice(0, 10)).toBe("2026-06-30");
  });

  it("from the start date just edits the amount", async () => {
    const rent = await createExpense({ ...base, name: "Rent", category: "RENT", amount: "4000.00", frequency: "MONTHLY", startDate: "2026-01-01" });
    await changeExpenseAmount(rent.id, "4200.00", "2026-01-01");
    expect(await prisma.expense.count()).toBe(1);
  });
});

describe("validation", () => {
  it("rejects bad input and ignores end dates on one-time costs", () => {
    const ok = { name: "x", category: "RENT", amount: "10", frequency: "MONTHLY", startDate: "2026-11-01" };
    expect(expenseSchema.safeParse({ ...ok, amount: "0" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...ok, endDate: "2026-10-01" }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...ok, category: "FOOD" }).success).toBe(false);
    expect(expenseSchema.parse({ ...ok, frequency: "ONE_TIME", endDate: "2026-12-01" }).endDate).toBeNull();
  });
});

describe("month summary", () => {
  it("combines sales, ingredient cost and overheads", async () => {
    const s = await seedBurgerScenario();
    // Costs per base unit: bun 0.80/pcs, patty 1.80/pcs, lettuce 0.009/g, mayo 0.012/g
    await prisma.ingredient.update({ where: { id: s.bun.id }, data: { costPerUnit: D("0.8") } });
    await prisma.ingredient.update({ where: { id: s.patty.id }, data: { costPerUnit: D("1.8") } });
    await prisma.ingredient.update({ where: { id: s.lettuce.id }, data: { costPerUnit: D("0.009") } });
    await prisma.ingredient.update({ where: { id: s.mayo.id }, data: { costPerUnit: D("0.012") } });
    await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 2 }])); // RM 25.80

    const month = localDate(new Date()).slice(0, 7);
    await createExpense({ ...base, name: "Rent", category: "RENT", amount: "3000.00", frequency: "MONTHLY", startDate: `${month}-01` });

    const sum = await monthSummary(month, "Asia/Kuala_Lumpur", false);
    expect(sum.revenue.toFixed(2)).toBe("25.80");
    // 2×(0.80 + 1.80 + 30×0.009 + 20×0.012) = 2×3.11 = 6.22
    expect(sum.ingredientCost.toFixed(2)).toBe("6.22");
    expect(sum.uncostedIngredients).toBe(0);
    expect(sum.overheads.toFixed(2)).toBe("3000.00");
    expect(sum.netProfit.toFixed(2)).toBe("-2980.42");
  });
});
