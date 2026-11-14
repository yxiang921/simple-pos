import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { countLowStock, lowStockIngredients } from "@/lib/services/inventory";
import { branchFilter, requireContext } from "@/lib/tenant";
import { dayRangeUtc, localDate } from "@/lib/time";
import { formatOrderNumber, formatQty, formatRM, formatTime, type BaseUnitCode } from "@/lib/format";
import { Badge, EmptyState, PageHeader, Panel, PanelHeader, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { OrderStatusBadge } from "../orders/status-badge";
import { SwitchBranchLink } from "../branch-switcher";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const ctx = await requireContext();
  const scope = branchFilter(ctx);
  const overview = !ctx.branch; // HQ: all branches
  const since = dayRangeUtc(localDate(new Date(), ctx.settings.timezone), ctx.settings.timezone).start;
  const [todayAgg, cancelledToday, pending, preparing, lowStock, recent, topItems, perBranch] = await Promise.all([
    prisma.order.aggregate({
      where: { ...scope, createdAt: { gte: since }, status: { not: "CANCELLED" } },
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.order.count({ where: { ...scope, createdAt: { gte: since }, status: "CANCELLED" } }),
    prisma.order.count({ where: { ...scope, status: "PENDING", isSimulated: false } }),
    prisma.order.count({ where: { ...scope, status: { in: ["PREPARING", "READY"] }, isSimulated: false } }),
    lowStockIngredients(scope),
    prisma.order.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { _count: { select: { items: true } }, branch: { select: { name: true } } },
    }),
    prisma.orderItem.groupBy({
      by: ["menuItemNameSnapshot"],
      where: { order: { ...scope, createdAt: { gte: since }, status: { not: "CANCELLED" } } },
      _sum: { quantity: true, subtotal: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    overview ? branchSummaries(ctx.branches.map((b) => b.id), since) : Promise.resolve(null),
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
      <PageHeader
        title={overview ? "Headquarters overview" : "Dashboard"}
        description={
          overview
            ? `Today's activity across all ${ctx.branches.length} branches. Choose a branch at the top to work on it.`
            : `Today's activity and stock at ${ctx.branch!.name}.`
        }
      />

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

      {perBranch && (
        <Panel className="mb-5">
          <PanelHeader title="Branches today" />
          <Table>
            <THead>
              <tr>
                <TH>Branch</TH>
                <TH className="text-right">Orders</TH>
                <TH className="text-right">Sales</TH>
                <TH className="text-right">Avg. order</TH>
                <TH className="text-right">Open orders</TH>
                <TH className="text-right">Low stock</TH>
                <TH className="text-right">Share of sales</TH>
              </tr>
            </THead>
            <tbody>
              {ctx.branches.map((b) => {
                const r = perBranch.get(b.id)!;
                const share = todayAgg._sum.totalAmount && todayAgg._sum.totalAmount.gt(0) ? r.sales / Number(todayAgg._sum.totalAmount) : 0;
                return (
                  <TR key={b.id}>
                    <TD>
                      <SwitchBranchLink branchId={b.id} href="/admin/dashboard" className="font-medium text-primary">
                        {b.name}
                      </SwitchBranchLink>
                      {b.isHeadquarters && <span className="ml-1.5 text-[12px] text-muted">HQ</span>}
                      {!b.isActive && <span className="ml-1.5 text-[12px] text-muted">(closed)</span>}
                    </TD>
                    <TD className="tabular text-right">{r.orders}</TD>
                    <TD className="tabular text-right">{formatRM(r.sales.toFixed(2))}</TD>
                    <TD className="tabular text-right text-muted">{r.orders ? formatRM((r.sales / r.orders).toFixed(2)) : "—"}</TD>
                    <TD className="tabular text-right">
                      {r.open > 0 ? (
                        <SwitchBranchLink branchId={b.id} href="/admin/orders?status=PENDING">
                          {r.open}
                        </SwitchBranchLink>
                      ) : (
                        <span className="text-muted">0</span>
                      )}
                    </TD>
                    <TD className={`tabular text-right ${r.low ? "text-warning" : "text-muted"}`}>{r.low}</TD>
                    <TD className="text-right">
                      <span className="inline-flex items-center gap-2">
                        <span className="h-1.5 w-20 overflow-hidden rounded-[2px] bg-[#ecece8]">
                          <span className="block h-full bg-primary" style={{ width: `${Math.round(share * 100)}%` }} />
                        </span>
                        <span className="tabular w-9 text-[12px] text-muted">{Math.round(share * 100)}%</span>
                      </span>
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        </Panel>
      )}

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
                  {overview && <TH>Branch</TH>}
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
                    {overview && <TD className="whitespace-nowrap text-muted">{o.branch.name}</TD>}
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
                    <span className="min-w-0 truncate">
                      {i.ingredient.name}
                      {overview && <span className="ml-1.5 text-[12px] text-muted">{i.branch.name}</span>}
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular text-muted">
                        {formatQty(i.currentStock.toString(), i.ingredient.unit as BaseUnitCode)}
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

async function branchSummaries(branchIds: string[], since: Date) {
  const [sales, open, low] = await Promise.all([
    prisma.order.groupBy({
      by: ["branchId"],
      where: { branchId: { in: branchIds }, createdAt: { gte: since }, status: { not: "CANCELLED" } },
      _count: true,
      _sum: { totalAmount: true },
    }),
    prisma.order.groupBy({
      by: ["branchId"],
      where: { branchId: { in: branchIds }, status: { in: ["PENDING", "PREPARING", "READY"] }, isSimulated: false },
      _count: true,
    }),
    Promise.all(branchIds.map(async (id) => [id, await countLowStock({ branchId: id })] as const)),
  ]);
  const lowBy = new Map(low);
  return new Map(
    branchIds.map((id) => {
      const s = sales.find((x) => x.branchId === id);
      return [
        id,
        {
          orders: s?._count ?? 0,
          sales: Number(s?._sum.totalAmount ?? 0),
          open: open.find((x) => x.branchId === id)?._count ?? 0,
          low: lowBy.get(id) ?? 0,
        },
      ];
    }),
  );
}
