import { Prisma } from "@/lib/generated/prisma/client";
import type { ExpenseCategory, ExpenseFrequency } from "@/lib/generated/prisma/enums";
import { prisma, table } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { addDays, dateColumn, dayRangeUtc } from "@/lib/time";

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

export type ExpenseInput = {
  name: string;
  category: ExpenseCategory;
  amount: string;
  frequency: ExpenseFrequency;
  startDate: string;
  endDate: string | null;
  notes: string;
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

function toData(input: ExpenseInput) {
  return {
    name: input.name,
    category: input.category,
    amount: new D(input.amount),
    frequency: input.frequency,
    startDate: dateColumn(input.startDate),
    endDate: input.frequency === "ONE_TIME" ? null : input.endDate ? dateColumn(input.endDate) : null,
    notes: input.notes,
  };
}

export async function createExpense(input: ExpenseInput) {
  return prisma.expense.create({ data: toData(input) });
}

/** Saving an entry in the app confirms it, so it no longer counts as dummy/simulated data. */
export async function updateExpense(id: string, input: ExpenseInput) {
  return prisma.expense.update({ where: { id }, data: { ...toData(input), isSimulated: false } });
}

export async function deleteExpense(id: string) {
  await prisma.expense.delete({ where: { id } });
}

/**
 * Change a recurring amount from a date onwards (e.g. rent goes up in January)
 * while keeping past months correct: the current entry ends the day before,
 * and a copy with the new amount starts on `effectiveFrom`.
 */
export async function changeExpenseAmount(id: string, amount: string, effectiveFrom: string) {
  return prisma.$transaction(async (tx) => {
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e) throw new DomainError("Expense not found.", "NOT_FOUND");
    if (e.frequency === "ONE_TIME") throw new DomainError("One-time expenses can simply be edited.");
    const start = iso(e.startDate);
    if (effectiveFrom <= start) {
      // Change applies from the very beginning: just edit the amount.
      return tx.expense.update({ where: { id }, data: { amount: new D(amount) } });
    }
    if (e.endDate && effectiveFrom > iso(e.endDate)) {
      throw new DomainError("The new amount would start after this expense has ended.");
    }
    await tx.expense.update({ where: { id }, data: { endDate: dateColumn(addDays(effectiveFrom, -1)) } });
    return tx.expense.create({
      data: {
        name: e.name,
        category: e.category,
        amount: new D(amount),
        frequency: e.frequency,
        startDate: dateColumn(effectiveFrom),
        endDate: e.endDate,
        notes: e.notes,
      },
    });
  });
}

// ─── Calculations ─────────────────────────────────────────────────────

function daysInMonth(date: string) {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function daysInYear(date: string) {
  const y = Number(date.slice(0, 4));
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
}

/** Cost charged on a single local date. Monthly amounts are spread over that month's days. */
export function costOnDay(
  e: { amount: Decimal; frequency: ExpenseFrequency; startDate: string; endDate: string | null },
  day: string,
): Decimal {
  if (day < e.startDate) return new D(0);
  if (e.frequency === "ONE_TIME") return day === e.startDate ? e.amount : new D(0);
  if (e.endDate && day > e.endDate) return new D(0);
  switch (e.frequency) {
    case "DAILY":
      return e.amount;
    case "WEEKLY":
      return e.amount.div(7);
    case "MONTHLY":
      return e.amount.div(daysInMonth(day));
    case "YEARLY":
      return e.amount.div(daysInYear(day));
  }
}

/** Typical monthly equivalent, for display (null for one-time costs). */
export function monthlyEquivalent(amount: Decimal, frequency: ExpenseFrequency): Decimal | null {
  switch (frequency) {
    case "ONE_TIME":
      return null;
    case "DAILY":
      return amount.mul(365).div(12);
    case "WEEKLY":
      return amount.mul(52).div(12);
    case "MONTHLY":
      return amount;
    case "YEARLY":
      return amount.div(12);
  }
}

/** Overheads between two local dates inclusive, total and by category. */
export async function overheadsForRange(from: string, to: string) {
  const rows = await prisma.expense.findMany({
    where: {
      startDate: { lte: dateColumn(to) },
      OR: [{ endDate: null }, { endDate: { gte: dateColumn(from) } }],
    },
  });
  const byCategory = new Map<ExpenseCategory, Decimal>();
  let total: Decimal = new D(0);
  for (const r of rows) {
    const e = { amount: r.amount, frequency: r.frequency, startDate: iso(r.startDate), endDate: r.endDate ? iso(r.endDate) : null };
    let sum: Decimal = new D(0);
    for (let d = from; d <= to; d = addDays(d, 1)) sum = sum.add(costOnDay(e, d));
    if (sum.gt(0)) {
      byCategory.set(r.category, (byCategory.get(r.category) ?? new D(0)).add(sum));
      total = total.add(sum);
    }
  }
  return { total, byCategory };
}

/**
 * Month summary: sales, ingredient cost of goods sold, overheads and estimated profit.
 * Ingredient cost uses the deducted-quantity snapshots × CURRENT ingredient cost
 * (costs are not snapshotted), so it is an estimate.
 */
export async function monthSummary(month: string, tz: string, includeSimulated: boolean) {
  const from = `${month}-01`;
  const to = `${month}-${String(daysInMonth(from)).padStart(2, "0")}`;
  const start = dayRangeUtc(from, tz).start;
  const end = dayRangeUtc(to, tz).end;
  const sim = includeSimulated ? Prisma.empty : Prisma.sql`AND o.is_simulated = false`;

  const [sales, cogs, overheads] = await Promise.all([
    prisma.order.aggregate({
      where: {
        createdAt: { gte: start, lt: end },
        status: { not: "CANCELLED" },
        ...(includeSimulated ? {} : { isSimulated: false }),
      },
      _sum: { totalAmount: true },
      _count: true,
    }),
    prisma.$queryRaw<{ cost: string | null; uncosted: bigint }[]>`
      SELECT COALESCE(SUM(oi.quantity_deducted * i.cost_per_unit), 0)::text AS cost,
             COUNT(DISTINCT i.id) FILTER (WHERE i.cost_per_unit IS NULL) AS uncosted
      FROM ${table("order_ingredients")} oi
      JOIN ${table("orders")} o ON o.id = oi.order_id
      JOIN ${table("ingredients")} i ON i.id = oi.ingredient_id
      WHERE o.created_at >= ${start} AND o.created_at < ${end}
        AND o.status <> 'CANCELLED' ${sim}`,
    overheadsForRange(from, to),
  ]);

  const revenue = sales._sum.totalAmount ?? new D(0);
  const ingredientCost = new D(cogs[0]?.cost ?? "0");
  const grossProfit = revenue.sub(ingredientCost);
  const netProfit = grossProfit.sub(overheads.total);
  const days = daysInMonth(from);
  const overheadPerDay = overheads.total.div(days);
  // Sales needed per day to cover overheads at this month's gross margin.
  const margin = revenue.gt(0) ? grossProfit.div(revenue) : null;
  const breakEvenPerDay = margin && margin.gt(0) ? overheadPerDay.div(margin) : null;

  return {
    from,
    to,
    orders: sales._count,
    revenue,
    ingredientCost,
    uncostedIngredients: Number(cogs[0]?.uncosted ?? 0),
    grossProfit,
    overheads: overheads.total,
    overheadsByCategory: overheads.byCategory,
    netProfit,
    overheadPerDay,
    breakEvenPerDay,
  };
}
