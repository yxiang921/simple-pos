import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { branchFilter, requireContext } from "@/lib/tenant";
import { formatDateTime, formatOrderNumber, formatQty, MOVEMENT_TYPE_LABEL, type BaseUnitCode } from "@/lib/format";
import { Select } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { Pagination, readPaging } from "@/components/ui/pagination";
import { Badge, EmptyState, PageHeader, Panel, Table, TD, TH, THead, TR } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Stock movements" };

const TYPES = ["INITIAL", "RESTOCK", "ORDER_DEDUCTION", "ORDER_CANCELLATION", "ADJUSTMENT"] as const;
const TYPE_TONE: Record<string, "neutral" | "green" | "warning" | "danger" | "outline"> = {
  INITIAL: "outline",
  RESTOCK: "green",
  ORDER_DEDUCTION: "neutral",
  ORDER_CANCELLATION: "outline",
  ADJUSTMENT: "warning",
};

export default async function MovementsPage({ searchParams }: PageProps<"/admin/inventory/movements">) {
  const sp = await searchParams;
  const ctx = await requireContext();
  const overview = !ctx.branch;
  const ingredientId = typeof sp.ingredient === "string" ? sp.ingredient : "";
  const type = typeof sp.type === "string" && (TYPES as readonly string[]).includes(sp.type) ? (sp.type as (typeof TYPES)[number]) : "";
  const { page, size } = readPaging(sp, 50);

  const where: Prisma.InventoryMovementWhereInput = { ...branchFilter(ctx) };
  if (ingredientId) where.ingredientId = ingredientId;
  if (type) where.movementType = type;

  const [movements, total, ingredients] = await Promise.all([
    prisma.inventoryMovement.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * size,
      take: size,
      include: {
        ingredient: { select: { name: true, unit: true } },
        order: { select: { orderNumber: true } },
        branch: { select: { name: true } },
      },
    }),
    prisma.inventoryMovement.count({ where }),
    prisma.ingredient.findMany({ where: { merchantId: ctx.merchant.id }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const href = ({ page: p = 1, size: z = size }: { page?: number; size?: number }) => {
    const u = new URLSearchParams();
    if (ingredientId) u.set("ingredient", ingredientId);
    if (type) u.set("type", type);
    if (z !== 50) u.set("size", String(z));
    if (p > 1) u.set("page", String(p));
    return `/admin/inventory/movements?${u}`;
  };

  return (
    <>
      <PageHeader
        title="Stock movements"
        description={
          overview
            ? "Every change to ingredient stock at every branch, with the resulting branch balance."
            : `Every change to ingredient stock${ctx.branches.length > 1 ? ` at ${ctx.branch!.name}` : ""}, with the resulting balance.`
        }
      />

      <form className="mb-3 flex flex-wrap gap-2" action="/admin/inventory/movements">
        <Select name="ingredient" defaultValue={ingredientId} className="h-8 w-56" aria-label="Ingredient">
          <option value="">All ingredients</option>
          {ingredients.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </Select>
        <Select name="type" defaultValue={type} className="h-8 w-52" aria-label="Movement type">
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {MOVEMENT_TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
        <button type="submit" className={buttonClass("secondary")}>
          Filter
        </button>
        {(ingredientId || type) && (
          <Link href="/admin/inventory/movements" className={buttonClass("ghost")}>
            Clear
          </Link>
        )}
      </form>

      <Panel>
        {movements.length === 0 ? (
          <EmptyState title="No stock movements" description="Restocks, order deductions and adjustments appear here." />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Time</TH>
                {overview && <TH>Branch</TH>}
                <TH>Ingredient</TH>
                <TH>Type</TH>
                <TH className="text-right">Change</TH>
                <TH className="text-right">Balance</TH>
                <TH>Order</TH>
                <TH>Reason</TH>
                <TH>By</TH>
              </tr>
            </THead>
            <tbody>
              {movements.map((m) => {
                const unit = m.ingredient.unit as BaseUnitCode;
                const positive = m.quantityChange.gt(0);
                return (
                  <TR key={m.id}>
                    <TD className="tabular whitespace-nowrap text-muted">{formatDateTime(m.createdAt)}</TD>
                    {overview && <TD className="whitespace-nowrap text-muted">{m.branch.name}</TD>}
                    <TD className="font-medium">
                      <Link href={`/admin/inventory/movements?ingredient=${m.ingredientId}`} className="hover:underline">
                        {m.ingredient.name}
                      </Link>
                    </TD>
                    <TD>
                      <Badge tone={TYPE_TONE[m.movementType]}>{MOVEMENT_TYPE_LABEL[m.movementType]}</Badge>
                    </TD>
                    <TD className={clsx("tabular whitespace-nowrap text-right font-medium", positive ? "text-primary" : "text-ink")}>
                      {positive ? "+" : "−"}
                      {formatQty(m.quantityChange.abs().toString(), unit)}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-right text-muted">{formatQty(m.balanceAfter.toString(), unit)}</TD>
                    <TD className="tabular">
                      {m.order ? (
                        <Link href={`/admin/orders?status=ALL&q=${m.order.orderNumber}`} className="text-primary hover:underline">
                          {formatOrderNumber(m.order.orderNumber)}
                        </Link>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </TD>
                    <TD className="max-w-[280px] truncate text-muted" title={m.reason}>
                      {m.reason}
                    </TD>
                    <TD className="max-w-[160px] truncate text-muted">{m.createdBy ?? (m.orderId ? "Guest order" : "—")}</TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>

      <Pagination
        page={page}
        size={size}
        total={total}
        noun="movements"
        action="/admin/inventory/movements"
        hidden={{ ingredient: ingredientId || undefined, type: type || undefined }}
        href={href}
      />
    </>
  );
}
