import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { formatDateTime, formatOrderNumber, formatRM, ORDER_STATUS_LABEL, ORDER_STATUSES, type BaseUnitCode, type OrderStatusCode } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Panel, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { Input } from "@/components/ui/form";
import { buttonClass } from "@/components/ui/button";
import { OrderStatusBadge } from "./status-badge";
import { OrderActions, type OrderDetail } from "./order-actions";

export const metadata: Metadata = { title: "Orders" };

const PAGE_SIZE = 25;
const FILTERS = [
  { key: "ACTIVE", label: "Active" },
  ...ORDER_STATUSES.map((s) => ({ key: s, label: ORDER_STATUS_LABEL[s] })),
  { key: "ALL", label: "All" },
];

export default async function OrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const filter = typeof sp.status === "string" && FILTERS.some((f) => f.key === sp.status) ? sp.status : "ACTIVE";
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const page = Math.max(1, Number(sp.page) || 1);

  // Simulated history (is_simulated) is hidden unless asked for, so the live queue stays clean.
  const showSim = sp.sim === "1";
  const where: Prisma.OrderWhereInput = showSim ? {} : { isSimulated: false };
  if (filter === "ACTIVE") where.status = { in: ["PENDING", "PREPARING", "READY"] };
  else if (filter !== "ALL") where.status = filter as OrderStatusCode;
  if (q) {
    const num = Number(q.replace(/^#/, ""));
    where.OR = [
      { customerName: { contains: q, mode: "insensitive" } },
      { tableNumber: { equals: q, mode: "insensitive" } },
      ...(Number.isInteger(num) && num > 0 && num < 2 ** 31 ? [{ orderNumber: num }] : []),
    ];
  }

  const [orders, total, counts] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { createdAt: filter === "ACTIVE" ? "asc" : "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        items: { orderBy: { menuItemNameSnapshot: "asc" } },
        ingredients: { orderBy: { ingredientNameSnapshot: "asc" } },
      },
    }),
    prisma.order.count({ where }),
    prisma.order.groupBy({ by: ["status"], where: showSim ? {} : { isSimulated: false }, _count: true }),
  ]);
  const countBy = Object.fromEntries(counts.map((c) => [c.status, c._count])) as Record<string, number>;
  const activeCount = (countBy.PENDING ?? 0) + (countBy.PREPARING ?? 0) + (countBy.READY ?? 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const href = (params: Record<string, string | number | undefined>) => {
    const u = new URLSearchParams();
    const merged = { status: filter, q, page: 1, sim: showSim ? "1" : undefined, ...params };
    for (const [k, v] of Object.entries(merged)) if (v !== undefined && v !== "" && !(k === "page" && v === 1)) u.set(k, String(v));
    return `/admin/orders?${u.toString()}`;
  };

  return (
    <>
      <PageHeader title="Orders" description="Live order queue — new orders and status changes appear automatically." />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-px overflow-hidden rounded-[4px] border border-line-strong bg-line-strong">
          {FILTERS.map((f) => {
            const n = f.key === "ACTIVE" ? activeCount : f.key === "ALL" ? undefined : countBy[f.key];
            return (
              <Link
                key={f.key}
                href={href({ status: f.key })}
                className={clsx(
                  "flex h-8 items-center gap-1.5 px-3 text-[13px]",
                  filter === f.key ? "bg-primary text-white" : "bg-surface text-ink hover:bg-hover",
                )}
              >
                {f.label}
                {n !== undefined && <span className={clsx("tabular text-[12px]", filter === f.key ? "text-white/80" : "text-muted")}>{n}</span>}
              </Link>
            );
          })}
        </div>
        <form className="flex gap-2" action="/admin/orders">
          <input type="hidden" name="status" value={filter} />
          {showSim && <input type="hidden" name="sim" value="1" />}
          <Input name="q" defaultValue={q} placeholder="Order #, customer or table" className="h-8 w-60" aria-label="Search orders" />
          <button className={buttonClass("secondary")} type="submit">
            Search
          </button>
          <Link href={href({ sim: showSim ? undefined : "1" })} className={buttonClass("ghost")}>
            {showSim ? "Hide simulated" : "Show simulated"}
          </Link>
        </form>
      </div>

      <Panel>
        {orders.length === 0 ? (
          <EmptyState
            title={q ? "No matching orders" : filter === "ACTIVE" ? "No active orders" : "No orders"}
            description={filter === "ACTIVE" && !q ? "New guest orders will appear here automatically." : undefined}
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Order</TH>
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
                  status: o.status,
                  paymentStatus: o.paymentStatus,
                  totalAmount: o.totalAmount.toFixed(2),
                  createdAt: o.createdAt.toISOString(),
                  cancelReason: o.cancelReason,
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
                    <TD className="max-w-[160px] truncate">{o.customerName}</TD>
                    <TD>{o.tableNumber ?? <span className="text-muted">—</span>}</TD>
                    <TD className="max-w-[300px]">
                      <span className="line-clamp-2">
                        {o.items.map((i) => `${i.quantity}× ${i.menuItemNameSnapshot}`).join(", ")}
                      </span>
                    </TD>
                    <TD className="tabular whitespace-nowrap text-right">{formatRM(o.totalAmount.toString())}</TD>
                    <TD>
                      <span className="flex items-center gap-1">
                        <OrderStatusBadge status={o.status} />
                        {o.isSimulated && <Badge tone="outline">Simulated</Badge>}
                      </span>
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

      {pages > 1 && (
        <div className="mt-3 flex items-center justify-between text-[13px] text-muted">
          <span>
            Page {page} of {pages} · {total} orders
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link className={buttonClass("secondary", "sm")} href={href({ page: page - 1 })}>
                Previous
              </Link>
            )}
            {page < pages && (
              <Link className={buttonClass("secondary", "sm")} href={href({ page: page + 1 })}>
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
