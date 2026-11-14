import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { Download, Package, ReceiptText, ShoppingBag, TrendingUp } from "lucide-react";
import { requireContext } from "@/lib/tenant";
import { localDate } from "@/lib/time";
import { formatRM } from "@/lib/format";
import { textParam } from "@/lib/params";
import { PERIODS, resolvePeriod, salesReport } from "@/lib/services/sales";
import { AreaChart } from "@/components/charts";
import { buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { EmptyState, Meter, PageHeader, Panel, PanelHeader, segmentClass, segmentedClass, StatGrid, Table, TD, TH, THead, TR } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Sales" };

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const rm0 = (v: number) => `RM ${Math.round(v).toLocaleString("en-MY")}`;
const fmtDate = (d: string) =>
  new Intl.DateTimeFormat("en-MY", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

function Delta({ value, label }: { value: number | null; label?: string }) {
  if (value === null)
    return (
      <span className="text-muted">
        No earlier data{label && label.startsWith("·") ? ` ${label}` : ""}
      </span>
    );
  const up = value >= 0;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("tabular inline-flex h-5 items-center rounded-full px-1.5 text-[11.5px] font-semibold", up ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
        {up ? "▲" : "▼"} {Math.abs(value * 100).toFixed(Math.abs(value) < 0.1 ? 1 : 0)}%
      </span>
      {label && <span className="text-muted">{label}</span>}
    </span>
  );
}

export default async function SalesPage({ searchParams }: PageProps<"/admin/sales">) {
  const sp = await searchParams;
  const ctx = await requireContext();
  const tz = ctx.settings.timezone;
  const today = localDate(new Date(), tz);
  const period = resolvePeriod(textParam(sp.period, 20) || undefined, today, { from: textParam(sp.from, 10), to: textParam(sp.to, 10) });
  const overview = !ctx.branch;
  const r = await salesReport({ merchantId: ctx.merchant.id, branchId: ctx.branch?.id ?? null }, period, tz);
  const { totals: t, previousTotals: pt } = r;
  const q = (extra: Record<string, string>) => `/admin/sales?${new URLSearchParams(extra)}`;
  const exportHref = `/admin/sales-export?${new URLSearchParams({ from: period.current.from, to: period.current.to })}`;
  const range = period.current.from === period.current.to ? fmtDate(period.current.from) : `${fmtDate(period.current.from)} – ${fmtDate(period.current.to)}`;
  const prevRange =
    period.previous.from === period.previous.to ? fmtDate(period.previous.from) : `${fmtDate(period.previous.from)} – ${fmtDate(period.previous.to)}`;

  // Heatmap: business hours that had any sales.
  const hours = [...new Set(r.heatmap.map((h) => h.hour))].sort((a, b) => a - b);
  const hFrom = hours.length ? Math.min(hours[0], 7) : 7;
  const hTo = hours.length ? Math.max(hours[hours.length - 1], 21) : 21;
  const hourList = Array.from({ length: hTo - hFrom + 1 }, (_, i) => hFrom + i);
  const cell = new Map(r.heatmap.map((h) => [`${h.dow}|${h.hour}`, h]));
  const maxCell = Math.max(1, ...r.heatmap.map((h) => h.revenue));
  const byDow = DOW.map((_, d) => r.heatmap.filter((h) => h.dow === d).reduce((s, h) => s + h.revenue, 0));
  const bestDow = byDow.indexOf(Math.max(...byDow));
  const best = r.series.reduce((b, x) => (x.value > b.value ? x : b), r.series[0]);

  return (
    <>
      <PageHeader
        title="Sales"
        description={`${overview ? "All branches" : ctx.branches.length > 1 ? ctx.branch!.name : ctx.merchant.name} · ${range}`}
        actions={
          <a href={exportHref} className={buttonClass("secondary")}>
            <Download /> Export CSV
          </a>
        }
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className={clsx(segmentedClass, "max-w-full flex-nowrap overflow-x-auto [scrollbar-width:none]")} aria-label="Period">
          {PERIODS.map((p) => (
            <Link key={p.key} href={q({ period: p.key })} className={segmentClass(period.key === p.key)} aria-current={period.key === p.key ? "page" : undefined}>
              {p.label}
            </Link>
          ))}
        </nav>
        <form action="/admin/sales" className="flex items-center gap-2">
          <input type="hidden" name="period" value="custom" />
          <Input type="date" name="from" defaultValue={period.current.from} max={today} className="h-8 w-[150px]" aria-label="From" />
          <span className="text-muted">–</span>
          <Input type="date" name="to" defaultValue={period.current.to} max={today} className="h-8 w-[150px]" aria-label="To" />
          <button type="submit" className={buttonClass(period.key === "custom" ? "primary" : "secondary")}>
            Apply
          </button>
        </form>
      </div>

      <StatGrid
        stats={[
          { label: "Sales", value: formatRM(t.revenue.toFixed(2)), sub: <Delta value={r.change.revenue} label={period.compareLabel} />, icon: <TrendingUp />, tone: "brand" },
          {
            label: "Orders",
            value: t.orders.toLocaleString(),
            sub: <Delta value={r.change.orders} label={t.cancelled ? `· ${t.cancelled} cancelled` : undefined} />,
            icon: <ReceiptText />,
            tone: "info",
          },
          { label: "Average order", value: formatRM(r.avgOrder.toFixed(2)), sub: <Delta value={r.change.avg} />, icon: <ShoppingBag />, tone: "success" },
          {
            label: "Items sold",
            value: t.items.toLocaleString(),
            sub: <Delta value={r.change.items} label={r.days > 1 ? `· ${Math.round(t.items / r.days).toLocaleString()}/day` : undefined} />,
            icon: <Package />,
            tone: "warning",
          },
        ]}
      />

      <Panel className="mb-5">
        <PanelHeader
          title={period.granularity === "hour" ? "Sales by hour" : period.granularity === "day" ? "Sales by day" : "Sales by month"}
          actions={
            <span className="flex items-center gap-4 text-[12px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-[3px] w-4 rounded-full bg-primary" /> {period.label}
              </span>
              <span className="hidden items-center gap-1.5 sm:flex" title={prevRange}>
                <span className="h-0 w-4 border-t-[1.5px] border-dashed border-subtle" /> {period.compareLabel.replace(/^vs /, "")} ({rm0(pt.revenue)})
              </span>
            </span>
          }
        />
        <div className="px-4 pb-3 pt-4">
          {t.orders === 0 && pt.orders === 0 ? (
            <EmptyState title="No sales in this period" description="Pick another period or a custom date range." />
          ) : (
            <AreaChart ariaLabel={`Sales ${period.label}`} data={r.series} compare={r.previousSeries} nowIndex={r.nowIndex} format={rm0} height={220} />
          )}
        </div>
        {best && best.value > 0 && (
          <div className="grid grid-cols-2 border-t border-line text-[13px] sm:grid-cols-4">
            {[
              [period.granularity === "hour" ? "Busiest hour" : period.granularity === "day" ? "Best day" : "Best month", `${best.label} · ${rm0(best.value)}`],
              ["Busiest weekday", byDow[bestDow] > 0 ? DOW[bestDow] : "—"],
              [period.granularity === "month" ? "Per month" : "Per day", rm0(t.revenue / (period.granularity === "month" ? r.series.length : r.days))],
              ["Previous period", `${rm0(pt.revenue)} · ${pt.orders.toLocaleString()} orders`],
            ].map(([k, v]) => (
              <div key={k} className="border-r border-line px-5 py-3 last:border-r-0">
                <p className="text-[11.5px] font-medium text-muted">{k}</p>
                <p className="tabular mt-0.5 font-semibold">{v}</p>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <PanelHeader title="Top items" />
          {r.topItems.length === 0 ? (
            <p className="px-5 py-6 text-[13px] text-muted">No items sold in this period.</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH className="w-8">#</TH>
                  <TH>Item</TH>
                  <TH className="text-right">Sold</TH>
                  <TH className="text-right">Sales</TH>
                  <TH>Share</TH>
                  <TH className="text-right">Change</TH>
                </tr>
              </THead>
              <tbody>
                {r.topItems.map((it, i) => (
                  <TR key={it.name}>
                    <TD className="tabular text-muted">{i + 1}</TD>
                    <TD className="font-medium">{it.name}</TD>
                    <TD className="tabular text-right">{it.qty.toLocaleString()}</TD>
                    <TD className="tabular whitespace-nowrap text-right">{formatRM(it.revenue.toFixed(2))}</TD>
                    <TD>
                      <span className="flex items-center gap-2">
                        <Meter value={it.share} className="w-20" />
                        <span className="tabular w-9 text-[12px] text-muted">{Math.round(it.share * 100)}%</span>
                      </span>
                    </TD>
                    <TD className="text-right">
                      {it.change === null ? <span className="text-[12px] text-muted">New</span> : <Delta value={it.change} />}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>

        <Panel className="h-fit">
          <PanelHeader title={overview && ctx.branches.length > 1 ? "By branch" : "By weekday"} />
          <ul className="space-y-3 px-5 py-4">
            {overview && ctx.branches.length > 1
              ? ctx.branches.map((b) => {
                  const x = r.byBranch.get(b.id) ?? { revenue: 0, orders: 0 };
                  return (
                    <li key={b.id}>
                      <div className="flex justify-between text-[13px]">
                        <span className="font-medium">{b.name}</span>
                        <span className="tabular">{formatRM(x.revenue.toFixed(2))}</span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <Meter value={t.revenue ? x.revenue / t.revenue : 0} className="flex-1" />
                        <span className="tabular w-[92px] text-right text-[11.5px] text-muted">{x.orders.toLocaleString()} orders</span>
                      </div>
                    </li>
                  );
                })
              : DOW.map((d, i) => (
                  <li key={d} className="flex items-center gap-3 text-[13px]">
                    <span className="w-9 text-muted">{d}</span>
                    <Meter value={byDow[i] / Math.max(1, ...byDow)} className="flex-1" />
                    <span className="tabular w-[84px] text-right">{rm0(byDow[i])}</span>
                  </li>
                ))}
          </ul>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="When you sell" actions={<span className="text-[12px] text-muted">Sales by weekday and hour</span>} />
        <div className="overflow-x-auto px-5 py-4">
          <div className="grid min-w-[640px] gap-[3px]" style={{ gridTemplateColumns: `36px repeat(${hourList.length}, minmax(0, 1fr))` }}>
            <span />
            {hourList.map((h) => (
              <span key={h} className="tabular pb-1 text-center text-[10.5px] text-subtle">
                {h % 2 === 0 ? String(h).padStart(2, "0") : ""}
              </span>
            ))}
            {DOW.map((d, di) => (
              <div key={d} className="contents">
                <span className="self-center text-[11.5px] text-muted">{d}</span>
                {hourList.map((h) => {
                  const c = cell.get(`${di}|${h}`);
                  const v = c ? c.revenue / maxCell : 0;
                  return (
                    <span
                      key={h}
                      title={`${d} ${String(h).padStart(2, "0")}:00 · ${c ? `${rm0(c.revenue)} · ${c.orders} orders` : "no sales"}`}
                      className="aspect-[1.6] rounded-[5px] transition-transform duration-200 hover:scale-110"
                      style={{
                        background: v > 0 ? `color-mix(in srgb, var(--primary) ${Math.round(12 + v * 88)}%, transparent)` : "var(--fill)",
                        boxShadow: v > 0.75 ? "0 0 12px -2px var(--primary-glow)" : undefined,
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-muted">
            Less
            {[0.15, 0.4, 0.65, 0.9].map((v) => (
              <span key={v} className="size-3 rounded-[3px]" style={{ background: `color-mix(in srgb, var(--primary) ${Math.round(12 + v * 88)}%, transparent)` }} />
            ))}
            More
          </div>
        </div>
      </Panel>
    </>
  );
}
