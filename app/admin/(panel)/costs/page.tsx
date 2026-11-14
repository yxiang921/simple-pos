import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { Building, Carrot, ChevronLeft, ChevronRight, PiggyBank, ShoppingBag } from "lucide-react";
import { prisma } from "@/lib/db";
import { monthlyEquivalent, monthSummary } from "@/lib/services/expenses";
import { localDate } from "@/lib/time";
import { requireContext } from "@/lib/tenant";
import { formatRM } from "@/lib/format";
import {
  EXPENSE_CATEGORY_SHORT,
  EXPENSE_FREQUENCY_LABEL,
  type ExpenseCategoryCode,
  type ExpenseFrequencyCode,
} from "@/lib/expense-labels";
import { buttonClass } from "@/components/ui/button";
import { EmptyState, PageHeader, Panel, PanelHeader, StatGrid, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { ExpenseRowActions, ExpenseToolbar, type ExpenseRow } from "./expense-dialogs";

export const metadata: Metadata = { title: "Costs" };

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shortDate = (s: string) =>
  new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${s}T00:00:00Z`));

export default async function CostsPage({ searchParams }: PageProps<"/admin/costs">) {
  const sp = await searchParams;
  const ctx = await requireContext();
  const tz = ctx.settings.timezone;
  const multi = ctx.branches.length > 1;
  const today = localDate(new Date(), tz);
  const thisMonth = today.slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) ? sp.month : thisMonth;
  // Generated history is always counted; ?sim=exclude (no link on screen) leaves it out.
  const includeSim = sp.sim !== "exclude";

  const [summary, expenses] = await Promise.all([
    monthSummary(ctx.merchant.id, month, tz, includeSim, ctx.branch?.id ?? null),
    prisma.expense.findMany({ where: { merchantId: ctx.merchant.id }, orderBy: [{ category: "asc" }, { name: "asc" }, { startDate: "desc" }] }),
  ]);

  const q = (params: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const merged = { month, sim: includeSim ? undefined : "exclude", ...params };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, v);
    return `/admin/costs?${u}`;
  };

  const rows: (ExpenseRow & { monthly: string | null; status: "active" | "ended" | "upcoming" })[] = expenses.map((e) => {
    const start = iso(e.startDate);
    const end = e.endDate ? iso(e.endDate) : null;
    const status =
      e.frequency === "ONE_TIME"
        ? start > today
          ? "upcoming"
          : "ended"
        : start > today
          ? "upcoming"
          : end && end < today
            ? "ended"
            : "active";
    return {
      id: e.id,
      name: e.name,
      category: e.category as ExpenseCategoryCode,
      amount: e.amount.toFixed(2),
      frequency: e.frequency as ExpenseFrequencyCode,
      startDate: start,
      endDate: end,
      notes: e.notes,
      isSimulated: e.isSimulated,
      monthly: monthlyEquivalent(e.amount, e.frequency)?.toFixed(2) ?? null,
      status,
    };
  });
  const activeMonthly = rows
    .filter((r) => r.status === "active" && r.monthly)
    .reduce((s, r) => s + Math.round(Number(r.monthly) * 100), 0); // display-only total, in cents

  const monthLabel = new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
  const net = summary.netProfit;
  const branchView = multi && Boolean(ctx.branch);
  const tiles = [
    { label: "Sales", value: formatRM(summary.revenue.toFixed(2)), sub: `${summary.orders} orders` },
    {
      label: "Ingredient cost (est.)",
      value: formatRM(summary.ingredientCost.toFixed(2)),
      sub: summary.uncostedIngredients
        ? `${summary.uncostedIngredients} ingredient(s) have no cost set`
        : summary.revenue.gt(0)
          ? `${summary.ingredientCost.div(summary.revenue).mul(100).toFixed(0)}% of sales`
          : "At current ingredient costs",
      warn: summary.uncostedIngredients > 0,
    },
    {
      label: branchView ? "Overheads (whole business)" : "Overheads",
      value: formatRM(summary.overheads.toFixed(2)),
      sub: `${formatRM(summary.overheadPerDay.toFixed(2))} per day`,
    },
    branchView
      ? {
          label: "Gross profit (this branch)",
          value: formatRM(summary.grossProfit.toFixed(2)),
          sub: "Sales − ingredients; shared running costs are in All branches",
          danger: summary.grossProfit.lt(0),
        }
      : {
          label: "Estimated profit",
          value: formatRM(net.toFixed(2)),
          sub: summary.breakEvenPerDay ? `Break-even: ${formatRM(summary.breakEvenPerDay.toFixed(2))} sales/day` : "Sales − ingredients − overheads",
          danger: net.lt(0),
        },
  ];

  return (
    <>
      <PageHeader
        title="Costs"
        description={
          multi
            ? ctx.branch
              ? `Sales and ingredient cost of ${ctx.branch.name}; running costs are the whole business's (shared by all branches).`
              : "Sales of all branches, the business's running costs (rent, utilities, salaries) and an estimated monthly profit."
            : "Running costs such as rent, utilities and salaries, and an estimated monthly profit."
        }
        actions={<ExpenseToolbar today={today} />}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={q({ month: shiftMonth(month, -1) })} className={buttonClass("secondary", "icon")} aria-label="Previous month">
            <ChevronLeft />
          </Link>
          <span className="min-w-[160px] text-center text-[15px] font-semibold tracking-[-0.01em]">{monthLabel}</span>
          <Link
            href={q({ month: shiftMonth(month, 1) })}
            className={clsx(buttonClass("secondary", "icon"), month >= thisMonth && "pointer-events-none opacity-40")}
            aria-label="Next month"
          >
            <ChevronRight />
          </Link>
          {month === thisMonth && <span className="text-[12px] text-muted">Month to date for sales; overheads for the full month</span>}
        </div>
      </div>

      <StatGrid
        stats={tiles.map((t, i) => ({
          label: t.label,
          value: t.value,
          sub: "warn" in t && t.warn ? <span className="text-warning">{t.sub}</span> : t.sub,
          icon: [<ShoppingBag key="s" />, <Carrot key="c" />, <Building key="o" />, <PiggyBank key="p" />][i],
          tone: (["brand", "warning", "info", "success"] as const)[i],
          valueTone: "danger" in t && t.danger ? "danger" : undefined,
        }))}
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Panel>
          <PanelHeader
            title="Running costs"
            actions={
              <span className="tabular text-[13px] text-muted">
                Active now: {formatRM((activeMonthly / 100).toFixed(2))}/month
              </span>
            }
          />
          {rows.length === 0 ? (
            <EmptyState
              title="No running costs yet"
              description="Add rent, electricity, water, salaries and other regular costs to see your estimated profit."
            />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Name</TH>
                  <TH>Category</TH>
                  <TH className="text-right">Amount</TH>
                  <TH className="text-right">Per month</TH>
                  <TH>Period</TH>
                  <TH className="text-right">Actions</TH>
                </tr>
              </THead>
              <tbody>
                {rows.map((r) => (
                  <TR key={r.id} className={r.status === "ended" && r.frequency !== "ONE_TIME" ? "text-muted" : undefined}>
                    <TD>
                      <p className="font-medium">
                        {r.name}
                      </p>
                      {r.notes && (
                        <p className="max-w-[220px] truncate text-[12px] text-muted" title={r.notes}>
                          {r.notes}
                        </p>
                      )}
                    </TD>
                    <TD>{EXPENSE_CATEGORY_SHORT[r.category]}</TD>
                    <TD className="tabular whitespace-nowrap text-right">
                      {formatRM(r.amount)}
                      <span className="block text-[12px] text-muted">{EXPENSE_FREQUENCY_LABEL[r.frequency].toLowerCase()}</span>
                    </TD>
                    <TD className="tabular whitespace-nowrap text-right">
                      {r.monthly ? formatRM(r.monthly) : <span className="text-subtle">—</span>}
                    </TD>
                    <TD className="whitespace-nowrap text-[12px] leading-snug text-muted">
                      {r.frequency === "ONE_TIME" ? (
                        shortDate(r.startDate)
                      ) : (
                        <>
                          <span className="block">From {shortDate(r.startDate)}</span>
                          <span className="block">{r.endDate ? `to ${shortDate(r.endDate)}` : "ongoing"}</span>
                        </>
                      )}
                      {r.status === "upcoming" && <span className="block font-medium text-warning">Upcoming</span>}
                      {r.status === "ended" && r.frequency !== "ONE_TIME" && <span className="block font-medium">Ended</span>}
                    </TD>
                    <TD className="text-right">
                      <ExpenseRowActions expense={r} today={today} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <div className="space-y-5">
        {multi && (
          <Panel>
            <PanelHeader title={`Sales by branch · ${monthLabel}`} />
            <ul className="divide-y divide-line">
              {ctx.branches.map((b) => {
                const r = summary.salesByBranch.get(b.id);
                const total = [...summary.salesByBranch.values()].reduce((s, x) => s + Number(x.revenue), 0);
                const share = total > 0 && r ? Number(r.revenue) / total : 0;
                return (
                  <li key={b.id} className={clsx("flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]", ctx.branch?.id === b.id && "bg-primary-soft")}>
                    <span className="min-w-0 truncate">
                      {b.name}
                      <span className="ml-1.5 text-[12px] text-muted">{(r?.orders ?? 0).toLocaleString()} orders</span>
                    </span>
                    <span className="tabular whitespace-nowrap">
                      {formatRM((r?.revenue ?? 0).toFixed(2))}
                      <span className="ml-2 inline-block w-10 text-right text-[12px] text-muted">{Math.round(share * 100)}%</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>
        )}
        <Panel>
          <PanelHeader title={`Overheads · ${monthLabel}`} />
          {summary.overheadsByCategory.size === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted">No running costs in this month.</p>
          ) : (
            <ul className="divide-y divide-line">
              {[...summary.overheadsByCategory.entries()]
                .sort((a, b) => b[1].comparedTo(a[1]))
                .map(([cat, amt]) => (
                  <li key={cat} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span>{EXPENSE_CATEGORY_SHORT[cat as ExpenseCategoryCode]}</span>
                    <span className="tabular">
                      {formatRM(amt.toFixed(2))}
                      <span className="ml-2 inline-block w-10 text-right text-[12px] text-muted">
                        {summary.overheads.gt(0) ? `${amt.div(summary.overheads).mul(100).toFixed(0)}%` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              <li className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] font-semibold">
                <span>Total</span>
                <span className="tabular pr-12">{formatRM(summary.overheads.toFixed(2))}</span>
              </li>
            </ul>
          )}
          <p className="border-t border-line px-4 py-3 text-[12px] leading-relaxed text-muted">
            Monthly costs are spread evenly over the days of each month; yearly costs over the year. Ingredient cost uses
            the quantities each order used × the current cost per unit.
          </p>
        </Panel>
        </div>
      </div>
    </>
  );
}
