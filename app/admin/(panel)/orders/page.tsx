import type { Metadata } from "next";
import { textParam } from "@/lib/params";
import Link from "next/link";
import { clsx } from "clsx";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { formatDateTime, formatOrderNumber, formatRM, ORDER_STATUS_LABEL, ORDER_STATUSES, type BaseUnitCode, type OrderStatusCode } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Panel, segmentClass, segmentedClass, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { Pagination, readPaging } from "@/components/ui/pagination";
import { dayRangeUtc } from "@/lib/time";
import { branchFilter, requireContext } from "@/lib/tenant";
import { switchHref } from "@/lib/links";
import { normalizeTableNumber } from "@/lib/floor";
import { tableNumberVariants } from "@/lib/services/floor";
import { X } from "lucide-react";
import { OrderStatusBadge } from "./status-badge";
import { OrderActions, type OrderDetail } from "./order-actions";

export const metadata: Metadata = { title: "Orders" };

const FILTERS = [
  { key: "ALL", label: "All" },
  { key: "ACTIVE", label: "Active" },
  ...ORDER_STATUSES.map((s) => ({ key: s, label: ORDER_STATUS_LABEL[s] })),
];

const isoDay = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "");

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const ctx = await requireContext();
  const scope = branchFilter(ctx);
  const overview = !ctx.branch;
  // Opens on "All" so every record (including the order history) is visible; "Active" is the kitchen queue.
  const filter = typeof sp.status === "string" && FILTERS.some((f) => f.key === sp.status) ? sp.status : "ALL";
  const q = textParam(sp.q);
  const from = isoDay(sp.from);
  const to = isoDay(sp.to);
  const { page: requestedPage, size } = readPaging(sp);
  // Generated history (is_simulated) is listed like any other order; ?sim=hide leaves it out.
  const hideSim = sp.sim === "hide";
  // ?table=5 → orders for that table (any spelling, e.g. "T05"); ?table=none → takeaway / no table.
  const table = textParam(sp.table, 20);
  const tableKey = table === "none" ? "none" : normalizeTableNumber(table);

  const [floorTables, variants] = await Promise.all([
    prisma.floorObject.findMany({ where: { merchantId: ctx.merchant.id, kind: "TABLE" }, select: { tableNumber: true, label: true } }),
    tableKey && tableKey !== "none" ? tableNumberVariants(scope, tableKey) : Promise.resolve([] as string[]),
  ]);
  const onFloor = new Map(floorTables.map((t) => [t.tableNumber!, t.label]));
  const tz = ctx.settings.timezone;
  // The floor shows one branch: from "All branches", a table link first switches to the order's branch.
  const floorHref = (table: string, branchId: string) => {
    const path = `/admin/floor?table=${encodeURIComponent(table)}`;
    return overview ? switchHref(branchId, path) : path;
  };
  const base: Prisma.OrderWhereInput = { ...scope, ...(hideSim ? { isSimulated: false } : {}) };
  if (from || to) {
    base.createdAt = {
      ...(from ? { gte: dayRangeUtc(from, tz).start } : {}),
      ...(to ? { lt: dayRangeUtc(to, tz).end } : {}),
    };
  }
  if (tableKey === "none") base.tableNumber = null;
  // No order was ever placed at this table: an empty IN list matches nothing (a NUL placeholder would make PostgreSQL reject the query).
  else if (tableKey) base.tableNumber = { in: variants };
  if (q) {
    const num = Number(q.replace(/^#/, ""));
    base.OR = [
      { customerName: { contains: q, mode: "insensitive" } },
      { tableNumber: { equals: q, mode: "insensitive" } },
      ...(Number.isInteger(num) && num > 0 && num < 2 ** 31 ? [{ orderNumber: num }] : []),
    ];
  }
  const where: Prisma.OrderWhereInput = { ...base };
  if (filter === "ACTIVE") where.status = { in: ["PENDING", "PREPARING", "READY"] };
  else if (filter !== "ALL") where.status = filter as OrderStatusCode;

  const [total, counts] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.groupBy({ by: ["status"], where: base, _count: true }),
  ]);
  const pages = Math.max(1, Math.ceil(total / size));
  const page = Math.min(requestedPage, pages); // a page past the end shows the last page
  const orders = await prisma.order.findMany({
    where,
    orderBy: [{ createdAt: filter === "ACTIVE" ? "asc" : "desc" }, { orderNumber: "desc" }],
    skip: (page - 1) * size,
    take: size,
    include: {
      items: { orderBy: { menuItemNameSnapshot: "asc" } },
      ingredients: { orderBy: { ingredientNameSnapshot: "asc" } },
      branch: { select: { id: true, name: true } },
    },
  });
  const countBy = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>;
  const allCount = Object.values(countBy).reduce((a, b) => a + b, 0);
  const activeCount = (countBy.PENDING ?? 0) + (countBy.PREPARING ?? 0) + (countBy.READY ?? 0);

  const params = { status: filter, q, from, to, table: tableKey ?? undefined, sim: hideSim ? "hide" : undefined, size: size === 25 ? undefined : String(size) };
  const href = (over: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, page: 1, ...over }))
      if (v !== undefined && v !== "" && !(k === "page" && v === 1) && !(k === "size" && String(v) === "25")) u.set(k, String(v));
    return `/admin/orders?${u.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Orders"
        description={
          overview
            ? "Orders from every branch, newest first. Choose a branch at the top to see only its orders."
            : `${ctx.branch!.name}: all orders, newest first — new orders and status changes appear automatically. Use Active for the kitchen queue.`
        }
      />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className={segmentedClass}>
          {FILTERS.map((f) => {
            const n = f.key === "ACTIVE" ? activeCount : f.key === "ALL" ? allCount : countBy[f.key];
            return (
              <Link
                key={f.key}
                href={href({ status: f.key })}
                className={segmentClass(filter === f.key)}
              >
                {f.label}
                <span className={clsx("tabular text-[11.5px]", filter === f.key ? "text-primary" : "text-subtle")}>{(n ?? 0).toLocaleString()}</span>
              </Link>
            );
          })}
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/admin/orders">
          <input type="hidden" name="status" value={filter} />
          {hideSim && <input type="hidden" name="sim" value="hide" />}
          {size !== 25 && <input type="hidden" name="size" value={size} />}
          {tableKey && <input type="hidden" name="table" value={tableKey} />}
          <Input name="q" defaultValue={q} placeholder="Order #, customer or table" className="h-8 w-52" aria-label="Search orders" />
          <Input name="from" type="date" defaultValue={from} className="h-8 w-36" aria-label="From date" />
          <span className="text-muted">–</span>
          <Input name="to" type="date" defaultValue={to} className="h-8 w-36" aria-label="To date" />
          <button className={buttonClass("secondary")} type="submit">
            Filter
          </button>
          {(q || from || to) && (
            <Link href={href({ q: undefined, from: undefined, to: undefined })} className={buttonClass("ghost")}>
              Clear
            </Link>
          )}
        </form>
      </div>

      {tableKey && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-primary/30 bg-primary-soft px-3 font-medium text-primary">
            {tableKey === "none" ? "No table (takeaway / counter)" : (onFloor.get(tableKey) ?? `Table ${tableKey}`)}
            <Link href={href({ table: undefined })} aria-label="Clear table filter" className="hover:text-primary-hover">
              <X className="size-3.5" />
            </Link>
          </span>
          {tableKey !== "none" && onFloor.has(tableKey) && !overview && (
            <Link href={`/admin/floor?table=${encodeURIComponent(tableKey)}`} className="text-primary hover:underline">
              Show on floor
            </Link>
          )}
          {tableKey !== "none" && !onFloor.has(tableKey) && <span className="text-muted">This table isn&apos;t on the floor plan.</span>}
        </div>
      )}

      <Panel>
        {orders.length === 0 ? (
          <EmptyState
            title={q || from || to || tableKey ? "No matching orders" : filter === "ACTIVE" ? "No active orders" : "No orders"}
            description={
              q || from || to ? "Try clearing the search or date range." : filter === "ACTIVE" ? "New guest orders will appear here automatically." : undefined
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Order</TH>
                {overview && <TH>Branch</TH>}
                <TH>Customer</TH>
                <TH>Table</TH>
                <TH>Items</TH>
                <TH className="text-right">Total</TH>
                <TH>Status</TH>
                <TH>Payment</TH>
                <TH>Created</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {orders.map((o) => {
                const detail: OrderDetail = {
                  id: o.id,
                  orderNumber: o.orderNumber,
                  customerName: o.customerName,
                  tableNumber: o.tableNumber,
                  floorHref: (() => {
                    const key = normalizeTableNumber(o.tableNumber);
                    return key && onFloor.has(key) ? floorHref(key, o.branchId) : null;
                  })(),
                  ordersHref: (() => {
                    const key = normalizeTableNumber(o.tableNumber);
                    if (!key) return null;
                    const path = `/admin/orders?table=${encodeURIComponent(key)}`;
                    return overview ? switchHref(o.branchId, path) : path;
                  })(),
                  branchName: o.branch.name,
                  status: o.status,
                  paymentStatus: o.paymentStatus,
                  totalAmount: o.totalAmount.toFixed(2),
                  createdAt: o.createdAt.toISOString(),
                  cancelReason: o.cancelReason,
                  isSimulated: o.isSimulated,
                  items: o.items.map((i) => ({
                    id: i.id,
                    name: i.menuItemNameSnapshot,
                    quantity: i.quantity,
                    unitPrice: i.unitPriceSnapshot.toFixed(2),
                    subtotal: i.subtotal.toFixed(2),
                  })),
                  ingredients: o.ingredients.map((g) => ({
                    id: g.id,
                    name: g.ingredientNameSnapshot,
                    unit: g.unitSnapshot as BaseUnitCode,
                    quantity: g.quantityDeducted.toString(),
                  })),
                };
                return (
                  <TR key={o.id} className={o.status === "CANCELLED" ? "text-muted" : undefined}>
                    <TD className="tabular font-medium">{formatOrderNumber(o.orderNumber)}</TD>
                    {overview && <TD className="whitespace-nowrap text-muted">{o.branch.name}</TD>}
                    <TD className="max-w-[160px] truncate">{o.customerName}</TD>
                    <TD>
                      {(() => {
                        const key = normalizeTableNumber(o.tableNumber);
                        if (!key) return <span className="text-muted">—</span>;
                        return onFloor.has(key) ? (
                          <a href={floorHref(key, o.branchId)} className="text-primary hover:underline" title="Show on floor">
                            {o.tableNumber}
                          </a>
                        ) : (
                          <span title="Not on the floor plan">{o.tableNumber}</span>
                        );
                      })()}
                    </TD>
                    <TD className="max-w-[300px]">
                      <span className="line-clamp-2">
                        {o.items.map((i) => `${i.quantity}× ${i.menuItemNameSnapshot}`).join(", ")}
                      </span>
                    </TD>
                    <TD className="tabular whitespace-nowrap text-right">{formatRM(o.totalAmount.toString())}</TD>
                    <TD>
                      <OrderStatusBadge status={o.status} />
                    </TD>
                    <TD>
                      {o.paymentStatus === "PAID" ? <Badge tone="green">Paid</Badge> : <Badge tone="outline">Unpaid</Badge>}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-muted">{formatDateTime(o.createdAt)}</TD>
                    <TD className="text-right">
                      <OrderActions order={detail} />
                    </TD>
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
        noun="orders"
        action="/admin/orders"
        hidden={{ status: filter, q, from, to, sim: hideSim ? "hide" : undefined }}
        href={({ page: p, size: z }) => href({ page: p, ...(z ? { size: String(z) } : {}) })}
      />
    </>
  );
}
