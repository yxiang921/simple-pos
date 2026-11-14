import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { lowStockIngredients } from "@/lib/services/inventory";
import { startOfTodayMYT } from "@/lib/time";
import { formatOrderNumber, formatQty, formatRM, formatTime, type BaseUnitCode } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Panel, PanelHeader, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { OrderStatusBadge } from "../orders/status-badge";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const since = startOfTodayMYT();
  const [todayAgg, cancelledToday, pending, preparing, lowStock, recent, topItems] = await Promise.all([
    prisma.order.aggregate({
      where: { createdAt: { gte: since }, status: { not: "CANCELLED" } },
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.order.count({ where: { createdAt: { gte: since }, status: "CANCELLED" } }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.order.count({ where: { status: { in: ["PREPARING", "READY"] } } }),
    lowStockIngredients(),
    prisma.order.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { _count: { select: { items: true } } },
    }),
    prisma.orderItem.groupBy({
      by: ["menuItemNameSnapshot"],
      where: { order: { createdAt: { gte: since }, status: { not: "CANCELLED" } } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
  ]);

  const stats = [
    { label: "Orders today", value: String(todayAgg._count), sub: cancelledToday ? `${cancelledToday} cancelled` : "Excludes cancelled" },
    { label: "Sales today", value: formatRM(todayAgg._sum.totalAmount?.toString() ?? "0"), sub: "Before payment" },
    { label: "Pending orders", value: String(pending), sub: `${preparing} preparing / ready`, href: "/admin/orders?status=PENDING" },
    {
      label: "Low-stock ingredients",
      value: String(lowStock.length),
      sub: lowStock.length ? "Restock needed" : "All above threshold",
      href: "/admin/ingredients?filter=low",
      warn: lowStock.length > 0,
    },
  ];

  return (
    <>
      <PageHeader title="Dashboard" description="Today's activity and stock at a glance." />

      <div className="mb-5 grid grid-cols-2 border-l border-t border-line bg-surface lg:grid-cols-4">
        {stats.map((s) => {
          const body = (
            <>
              <p className="text-[12px] font-medium uppercase tracking-[0.03em] text-muted">{s.label}</p>
              <p className={`tabular mt-1.5 text-[24px] font-semibold leading-none ${s.warn ? "text-warning" : "text-ink"}`}>
                {s.value}
              </p>
              <p className="mt-1.5 text-[12px] text-muted">{s.sub}</p>
            </>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} className="border-b border-r border-line px-4 py-3.5 hover:bg-[#fbfbfa]">
              {body}
            </Link>
          ) : (
            <div key={s.label} className="border-b border-r border-line px-4 py-3.5">
              {body}
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader
            title="Recent orders"
            actions={
              <Link href="/admin/orders" className="text-[13px] text-primary hover:underline">
                View all
              </Link>
            }
          />
          {recent.length === 0 ? (
            <EmptyState title="No orders yet" description="Orders placed from the guest menu will appear here." />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>Order</TH>
                  <TH>Customer</TH>
                  <TH>Table</TH>
                  <TH className="text-right">Items</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Time</TH>
                </tr>
              </THead>
              <tbody>
                {recent.map((o) => (
                  <TR key={o.id}>
                    <TD className="tabular font-medium">{formatOrderNumber(o.orderNumber)}</TD>
                    <TD className="max-w-[160px] truncate">{o.customerName}</TD>
                    <TD className="text-muted">{o.tableNumber ?? "—"}</TD>
                    <TD className="tabular text-right">{o._count.items}</TD>
                    <TD className="tabular text-right">{formatRM(o.totalAmount.toString())}</TD>
                    <TD>
                      <OrderStatusBadge status={o.status} />
                    </TD>
                    <TD className="tabular text-right text-muted">{formatTime(o.createdAt)}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel>
            <PanelHeader
              title="Low stock"
              actions={
                <Link href="/admin/ingredients?filter=low" className="text-[13px] text-primary hover:underline">
                  Inventory
                </Link>
              }
            />
            {lowStock.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-muted">All ingredients are above their thresholds.</p>
            ) : (
              <ul className="divide-y divide-line">
                {lowStock.slice(0, 8).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span className="truncate">{i.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="tabular text-muted">
                        {formatQty(i.currentStock.toString(), i.unit as BaseUnitCode)}
                      </span>
                      {i.currentStock.lte(0) ? <Badge tone="danger">Out</Badge> : <Badge tone="warning">Low</Badge>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Top items today" />
            {topItems.length === 0 ? (
              <p className="px-4 py-6 text-[13px] text-muted">No sales yet today.</p>
            ) : (
              <ul className="divide-y divide-line">
                {topItems.map((t) => (
                  <li key={t.menuItemNameSnapshot} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span className="truncate">{t.menuItemNameSnapshot}</span>
                    <span className="tabular whitespace-nowrap text-muted">
                      {t._sum.quantity} sold · {formatRM(t._sum.subtotal?.toString() ?? "0")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}
