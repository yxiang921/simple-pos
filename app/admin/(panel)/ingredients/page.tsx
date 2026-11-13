import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { prisma } from "@/lib/db";
import { stockStatus, type StockStatus } from "@/lib/services/inventory";
import { COST_UNIT, formatDateTime, formatQty, formatQtyHint, formatRM, BASE_UNIT_LABEL, type BaseUnitCode } from "@/lib/format";
import { Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader, Panel, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { IngredientToolbar, IngredientRowActions, type IngredientRow } from "./ingredient-dialogs";

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

  const all = await prisma.ingredient.findMany({
    where: q
      ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { sku: { contains: q, mode: "insensitive" } }] }
      : undefined,
    orderBy: { name: "asc" },
    include: { _count: { select: { recipes: true } } },
  });

  const rows = all
    .map((i) => ({ ...i, status: stockStatus(i) }))
    .filter((i) =>
      filter === "low" ? i.status === "LOW" || i.status === "OUT" : filter === "inactive" ? i.status === "INACTIVE" : true,
    );
  const lowCount = all.filter((i) => ["LOW", "OUT"].includes(stockStatus(i))).length;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Ingredient stock in base units (pcs, g, ml). Orders deduct automatically from recipes."
        actions={<IngredientToolbar />}
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-px overflow-hidden rounded-[4px] border border-line-strong bg-line-strong">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={`/admin/ingredients?filter=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={clsx(
                "flex h-8 items-center gap-1.5 px-3 text-[13px]",
                filter === f.key ? "bg-primary text-white" : "bg-surface text-ink hover:bg-hover",
              )}
            >
              {f.label}
              {f.key === "low" && lowCount > 0 && (
                <span className={clsx("tabular text-[12px]", filter === f.key ? "text-white/80" : "text-warning")}>{lowCount}</span>
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
                <TH className="text-right">Current stock</TH>
                <TH className="text-right">Low at</TH>
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
                    </TD>
                    <TD className="tabular text-right text-muted">
                      {i._count.recipes} {i._count.recipes === 1 ? "item" : "items"}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-muted">{formatDateTime(i.updatedAt)}</TD>
                    <TD className="text-right">
                      <IngredientRowActions ingredient={row} />
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
