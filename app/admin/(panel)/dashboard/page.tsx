import type { Metadata } from "next";
import Link from "next/link";
import { prisma, table } from "@/lib/db";
import { countLowStock, lowStockIngredients } from "@/lib/services/inventory";
import { branchFilter, requireContext } from "@/lib/tenant";
import { addDays, dayRangeUtc, localDate } from "@/lib/time";
import { formatOrderNumber, formatQty, formatRM, formatTime, type BaseUnitCode } from "@/lib/format";
import { Badge, EmptyState, Meter, PageHeader, Panel, PanelHeader, StatGrid, Table, TD, TH, THead, TR, type Stat } from "@/components/ui/misc";
import { AreaChart } from "@/components/charts";
import { Clock3, PackageOpen, ReceiptText, TrendingUp } from "lucide-react";
import { Prisma } from "@/lib/generated/prisma/client";
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

  const hourly = await salesByHour(ctx.merchant.id, ctx.branch?.id ?? null, ctx.settings.timezone);
  const stats: Stat[] = [
    {
      label: "Orders today",
      value: todayAgg._count.toLocaleString(),
      sub: cancelledToday ? `${cancelledToday} cancelled` : "Excludes cancelled",
      icon: <ReceiptText />,
      tone: "brand",
    },
    {
      label: "Sales today",
      value: formatRM(todayAgg._sum.totalAmount?.toString() ?? "0"),
      sub: hourly.change === null ? "Before payment" : `${hourly.change >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(hourly.change * 100))}% vs last week, same time`,
      icon: <TrendingUp />,
      tone: "success",
      href: "/admin/sales?period=today",
    },
    {
      label: "Pending orders",
      value: String(pending),
      sub: `${preparing} preparing / ready`,
      href: "/admin/orders?status=PENDING",
      icon: <Clock3 />,
      tone: "info",
    },
    {
      label: "Low-stock ingredients",
      value: String(lowStock.length),
      sub: lowStock.length ? "Restock needed" : "All above threshold",
      href: "/admin/ingredients?filter=low",
      icon: <PackageOpen />,
      tone: "warning",
      valueTone: lowStock.length > 0 ? "warning" : undefined,
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

      <StatGrid stats={stats} />

      <Panel className="mb-5">
        <PanelHeader
          title="Sales by hour"
          actions={
            <span className="flex items-center gap-4 text-[12px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-[3px] w-4 rounded-full bg-primary" /> Today
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-4 border-t-[1.5px] border-dashed border-subtle" /> Same day last week
              </span>
            </span>
          }
        />
        <div className="px-4 pb-3 pt-4">
          <AreaChart
            ariaLabel="Sales by hour today"
            data={hourly.today}
            compare={hourly.lastWeek}
            nowIndex={hourly.nowIndex}
            format={(v) => `RM ${Math.round(v)}`}
          />
        </div>
      </Panel>

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
                        <Meter value={share} className="w-24" />
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

/** Sales per local hour today and on the same weekday last week (up to the same time), for the chart. */
async function salesByHour(merchantId: string, branchId: string | null, tz: string) {
  const today = localDate(new Date(), tz);
  const lastWeek = addDays(today, -7);
  const start = dayRangeUtc(lastWeek, tz).start;
  const where = branchId ? Prisma.sql`o.branch_id = ${branchId}` : Prisma.sql`b.merchant_id = ${merchantId}`;
  const rows = await prisma.$queryRaw<{ day: string; hour: number; total: string }[]>`
    SELECT ((o.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date::text AS day,
           EXTRACT(HOUR FROM ((o.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz}))::int AS hour,
           SUM(o.total_amount)::text AS total
    FROM ${table("orders")} o JOIN ${table("branches")} b ON b.id = o.branch_id
    WHERE ${where} AND o.status <> 'CANCELLED' AND o.created_at >= ${start}
    GROUP BY 1, 2`;
  const by = (day: string) => {
    const a = Array<number>(24).fill(0);
    for (const r of rows) if (r.day === day) a[r.hour] = Number(r.total);
    return a;
  };
  const t = by(today);
  const w = by(lastWeek);
  const nowHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(new Date()));
  // Show the business hours that have any sales (either day), at least 7:00–21:00.
  const used = [...t.keys()].filter((h) => t[h] > 0 || w[h] > 0);
  const from = Math.min(7, ...used);
  const to = Math.max(21, ...used);
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const sumTo = (a: number[]) => a.slice(0, nowHour + 1).reduce((s, v) => s + v, 0);
  const prev = sumTo(w);
  return {
    today: hours.map((h) => ({ label: `${String(h).padStart(2, "0")}:00`, value: t[h] })),
    lastWeek: hours.map((h) => w[h]),
    nowIndex: Math.max(0, Math.min(hours.length - 1, nowHour - from)),
    change: prev > 0 ? sumTo(t) / prev - 1 : null,
  };
}
