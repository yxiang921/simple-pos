import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { requireContext } from "@/lib/tenant";
import { stockStatus, type StockStatus } from "@/lib/services/inventory";
import { COST_UNIT, formatDateTime, formatQty, formatQtyHint, formatRM, BASE_UNIT_LABEL, type BaseUnitCode } from "@/lib/format";
import { Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, Panel, segmentClass, segmentedClass, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { IngredientToolbar, IngredientRowActions, type BranchChoice, type IngredientRow } from "./ingredient-dialogs";

const ZERO = new Prisma.Decimal(0);
const RANK: Record<StockStatus, number> = { OUT: 3, LOW: 2, OK: 1, INACTIVE: 0 };

export const metadata: Metadata = { title: "Inventory" };

const STATUS_BADGE: Record<StockStatus, { tone: "green" | "warning" | "danger" | "outline"; label: string }> = {
  OK: { tone: "green", label: "In stock" },
  LOW: { tone: "warning", label: "Low" },
  OUT: { tone: "danger", label: "Out" },
  INACTIVE: { tone: "outline", label: "Inactive" },
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "low", label: "Low & out" },
  { key: "inactive", label: "Inactive" },
];

export default async function IngredientsPage({ searchParams }: PageProps<"/admin/ingredients">) {
  const sp = await searchParams;
  const filter = typeof sp.filter === "string" && FILTERS.some((f) => f.key === sp.filter) ? sp.filter : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const ctx = await requireContext();
  const branchId = ctx.branch?.id ?? null;
  const multi = ctx.branches.length > 1;
  const choice: BranchChoice = { branches: ctx.branches.map((b) => ({ id: b.id, name: b.name })), current: branchId, hqId: ctx.hq.id };

  const found = await prisma.ingredient.findMany({
    where: {
      merchantId: ctx.merchant.id,
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { name: "asc" },
    include: { _count: { select: { recipes: true } }, stocks: { select: { branchId: true, currentStock: true, lowStockThreshold: true } } },
  });

  // In a branch: that branch's stock. In "All branches": the total, flagged by the worst branch.
  const all = found.map((i) => {
    const byBranch = new Map(i.stocks.map((s) => [s.branchId, s]));
    const perBranch = ctx.branches.map((b) => {
      const st = byBranch.get(b.id);
      const currentStock = st?.currentStock ?? ZERO;
      const lowStockThreshold = st?.lowStockThreshold ?? ZERO;
      return { branch: b, currentStock, lowStockThreshold, status: stockStatus({ currentStock, lowStockThreshold, isActive: i.isActive }) };
    });
    const mine = branchId ? perBranch.find((p) => p.branch.id === branchId)! : null;
    const hq = perBranch.find((p) => p.branch.id === ctx.hq.id)!;
    const worst = perBranch.filter((p) => p.branch.isActive).reduce((w, p) => (RANK[p.status] > RANK[w.status] ? p : w), hq);
    return {
      ...i,
      currentStock: mine ? mine.currentStock : perBranch.reduce((s, p) => s.add(p.currentStock), ZERO),
      lowStockThreshold: mine ? mine.lowStockThreshold : hq.lowStockThreshold,
      perBranch,
      flagged: mine ? null : perBranch.filter((p) => p.branch.isActive && (p.status === "LOW" || p.status === "OUT")),
      status: mine ? mine.status : worst.status,
    };
  });

  const rows = all
    .filter((i) =>
      filter === "low" ? i.status === "LOW" || i.status === "OUT" : filter === "inactive" ? i.status === "INACTIVE" : true,
    );
  const lowCount = all.filter((i) => i.status === "LOW" || i.status === "OUT").length;

  return (
    <>
      <PageHeader
        title="Inventory"
        description={
          multi
            ? branchId
              ? `Stock at ${ctx.branch!.name} in base units (pcs, g, ml). The ingredient list is shared by all branches; each branch keeps its own stock.`
              : "Total stock across all branches. Status shows the worst branch. Choose a branch at the top to see one branch's stock."
            : "Ingredient stock in base units (pcs, g, ml). Orders deduct automatically from recipes."
        }
        actions={<IngredientToolbar branches={choice} />}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className={segmentedClass}>
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/admin/ingredients?filter=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={segmentClass(filter === f.key)}
            >
              {f.label}
              {f.key === "low" && lowCount > 0 && (
                <span className="tabular rounded-full bg-warning-soft px-1.5 text-[11px] text-warning">{lowCount}</span>
              )}
            </Link>
          ))}
        </div>
        <form className="flex gap-2" action="/admin/ingredients">
          <input type="hidden" name="filter" value={filter} />
          <Input name="q" defaultValue={q} placeholder="Search name or SKU" className="h-8 w-56" aria-label="Search ingredients" />
          <button className={buttonClass("secondary")} type="submit">
            Search
          </button>
        </form>
      </div>

      <Panel>
        {rows.length === 0 ? (
          <EmptyState
            title={all.length === 0 && !q ? "No ingredients yet" : "Nothing matches this view"}
            description={all.length === 0 && !q ? "Add ingredients, then use them in menu recipes." : undefined}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Ingredient</TH>
                <TH>SKU</TH>
                <TH>Unit</TH>
                <TH className="text-right">{multi && !branchId ? "Total stock" : "Current stock"}</TH>
                <TH className="text-right">{multi && !branchId ? "Low at (HQ)" : "Low at"}</TH>
                <TH className="text-right">Cost</TH>
                <TH>Status</TH>
                <TH className="text-right">Used in</TH>
                <TH>Last updated</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {rows.map((i) => {
                const unit = i.unit as BaseUnitCode;
                const hint = formatQtyHint(i.currentStock.toString(), unit);
                const badge = STATUS_BADGE[i.status];
                const row: IngredientRow = {
                  id: i.id,
                  name: i.name,
                  sku: i.sku,
                  unit,
                  currentStock: i.currentStock.toString(),
                  lowStockThreshold: i.lowStockThreshold.toString(),
                  stockByBranch: Object.fromEntries(i.perBranch.map((p) => [p.branch.id, p.currentStock.toString()])),
                  isActive: i.isActive,
                  // Shown/edited per kg, L or pcs; stored per base unit.
                  cost: i.costPerUnit ? i.costPerUnit.mul(COST_UNIT[unit].factor).toDecimalPlaces(4).toString() : "",
                };
                return (
                  <TR key={i.id} className={!i.isActive ? "text-muted" : undefined}>
                    <TD className="font-medium">{i.name}</TD>
                    <TD className="text-muted">{i.sku ?? "—"}</TD>
                    <TD>{BASE_UNIT_LABEL[unit]}</TD>
                    <TD className="tabular text-right">
                      <span
                        className={clsx(
                          "font-medium",
                          i.status === "OUT" && "text-danger",
                          i.status === "LOW" && "text-warning",
                        )}
                      >
                        {formatQty(i.currentStock.toString())}
                      </span>
                      {hint && <span className="ml-1.5 text-[12px] text-muted">({hint})</span>}
                      {multi && !branchId && (
                        <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                          {i.perBranch.map((p) => (
                            <span key={p.branch.id} className={clsx("block whitespace-nowrap", (p.status === "LOW" || p.status === "OUT") && "text-warning")}>
                              {p.branch.name} {formatQty(p.currentStock.toString())}
                            </span>
                          ))}
                        </span>
                      )}
                    </TD>
                    <TD className="tabular text-right text-muted">{formatQty(i.lowStockThreshold.toString())}</TD>
                    <TD className="tabular whitespace-nowrap text-right">
                      {row.cost ? (
                        <>
                          {formatRM(row.cost)}
                          <span className="text-[12px] text-muted">/{COST_UNIT[unit].value}</span>
                        </>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </TD>
                    <TD>
                      {i.status === "OK" ? (
                        <span className="text-[12px] text-muted">{badge.label}</span>
                      ) : (
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                      )}
                      {i.flagged && i.flagged.length > 0 && (
                        <span className="mt-0.5 block text-[11px] text-muted">{i.flagged.map((p) => p.branch.name).join(", ")}</span>
                      )}
                    </TD>
                    <TD className="tabular text-right text-muted">
                      {i._count.recipes} {i._count.recipes === 1 ? "item" : "items"}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-muted">{formatDateTime(i.updatedAt)}</TD>
                    <TD className="text-right">
                      <IngredientRowActions ingredient={row} branches={choice} />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
