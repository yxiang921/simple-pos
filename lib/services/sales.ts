import { Prisma } from "@/lib/generated/prisma/client";
import { prisma, table } from "@/lib/db";
import { addDays, dayRangeUtc } from "@/lib/time";

/**
 * Sales history: totals, a time series, top items, branches and a weekday ×
 * hour heatmap for a period of local dates, compared with the previous period.
 * Cancelled orders are excluded from sales (counted separately).
 */

export const PERIODS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this-week", label: "This week" },
  { key: "last-week", label: "Last week" },
  { key: "last-7", label: "Last 7 days" },
  { key: "this-month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "last-30", label: "Last 30 days" },
  { key: "last-90", label: "Last 90 days" },
  { key: "this-year", label: "This year" },
  { key: "last-year", label: "Last year" },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"] | "custom";

export type Range = { from: string; to: string };
export type ResolvedPeriod = {
  key: PeriodKey;
  label: string;
  current: Range;
  previous: Range;
  /** e.g. "vs same day last week" */
  compareLabel: string;
  granularity: "hour" | "day" | "month";
};

const DAY = 864e5;
const days = (r: Range) => Math.round((Date.parse(r.to) - Date.parse(r.from)) / DAY) + 1;
/** Monday = 0 … Sunday = 6 */
const mon0 = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
const shiftMonth = (d: string, by: number) => {
  const [y, m] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 10);
};
const monthEnd = (d: string) => addDays(shiftMonth(d, 1), -1);
const shortDate = (d: string) =>
  new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

export function resolvePeriod(key: string | undefined, today: string, custom?: { from?: string; to?: string }): ResolvedPeriod {
  const iso = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) ? v : null);
  let k = (PERIODS.some((p) => p.key === key) ? key : key === "custom" ? "custom" : "last-7") as PeriodKey;
  let cur: Range;
  let prev: Range;
  let compareLabel: string;

  const lastN = (n: number): [Range, Range, string] => {
    const c = { from: addDays(today, -(n - 1)), to: today };
    return [c, { from: addDays(c.from, -n), to: addDays(c.from, -1) }, `vs previous ${n} days`];
  };

  switch (k) {
    case "today":
      cur = { from: today, to: today };
      prev = { from: addDays(today, -7), to: addDays(today, -7) };
      compareLabel = "vs same day last week";
      break;
    case "yesterday": {
      const y = addDays(today, -1);
      cur = { from: y, to: y };
      prev = { from: addDays(y, -7), to: addDays(y, -7) };
      compareLabel = "vs same day the week before";
      break;
    }
    case "this-week": {
      const start = addDays(today, -mon0(today));
      cur = { from: start, to: today };
      prev = { from: addDays(start, -7), to: addDays(today, -7) };
      compareLabel = "vs last week, same days";
      break;
    }
    case "last-week": {
      const start = addDays(today, -mon0(today) - 7);
      cur = { from: start, to: addDays(start, 6) };
      prev = { from: addDays(start, -7), to: addDays(start, -1) };
      compareLabel = "vs the week before";
      break;
    }
    case "this-month": {
      cur = { from: monthStart(today), to: today };
      const pStart = shiftMonth(today, -1);
      prev = { from: pStart, to: [addDays(pStart, days(cur) - 1), monthEnd(pStart)].sort()[0] };
      compareLabel = "vs last month, same days";
      break;
    }
    case "last-month": {
      const start = shiftMonth(today, -1);
      cur = { from: start, to: monthEnd(start) };
      prev = { from: shiftMonth(start, -1), to: monthEnd(shiftMonth(start, -1)) };
      compareLabel = "vs the month before";
      break;
    }
    case "this-year": {
      cur = { from: `${today.slice(0, 4)}-01-01`, to: today };
      const y = String(Number(today.slice(0, 4)) - 1);
      prev = { from: `${y}-01-01`, to: `${y}${today.slice(4)}` };
      compareLabel = "vs last year, same dates";
      break;
    }
    case "last-year": {
      const y = String(Number(today.slice(0, 4)) - 1);
      cur = { from: `${y}-01-01`, to: `${y}-12-31` };
      prev = { from: `${Number(y) - 1}-01-01`, to: `${Number(y) - 1}-12-31` };
      compareLabel = "vs the year before";
      break;
    }
    case "last-30":
      [cur, prev, compareLabel] = lastN(30);
      break;
    case "last-90":
      [cur, prev, compareLabel] = lastN(90);
      break;
    case "custom": {
      let from = iso(custom?.from) ?? addDays(today, -6);
      let to = iso(custom?.to) ?? today;
      if (from > to) [from, to] = [to, from];
      if (to > today) to = today;
      if (from > to) from = to;
      if (days({ from, to }) > 731) from = addDays(to, -730);
      cur = { from, to };
      const n = days(cur);
      prev = { from: addDays(from, -n), to: addDays(from, -1) };
      compareLabel = `vs previous ${n === 1 ? "day" : `${n} days`}`;
      break;
    }
    default:
      k = "last-7";
      [cur, prev, compareLabel] = lastN(7);
  }

  const n = days(cur);
  const label =
    k === "custom" ? (cur.from === cur.to ? shortDate(cur.from) : `${shortDate(cur.from)} – ${shortDate(cur.to)}`) : PERIODS.find((p) => p.key === k)!.label;
  return { key: k, label, current: cur, previous: prev, compareLabel, granularity: n === 1 ? "hour" : n <= 92 ? "day" : "month" };
}

export type SalesScope = { merchantId: string; branchId?: string | null };
type Totals = { revenue: number; orders: number; cancelled: number; items: number };

function scopeSql(s: SalesScope) {
  return s.branchId ? Prisma.sql`o.branch_id = ${s.branchId}` : Prisma.sql`b.merchant_id = ${s.merchantId}`;
}
function bounds(r: Range, tz: string) {
  return { start: dayRangeUtc(r.from, tz).start, end: dayRangeUtc(r.to, tz).end };
}

async function totals(s: SalesScope, r: Range, tz: string): Promise<Totals> {
  const { start, end } = bounds(r, tz);
  const [row] = await prisma.$queryRaw<{ revenue: string | null; orders: bigint; cancelled: bigint; items: bigint | null }[]>`
    SELECT COALESCE(SUM(o.total_amount) FILTER (WHERE o.status <> 'CANCELLED'), 0)::text AS revenue,
           COUNT(*) FILTER (WHERE o.status <> 'CANCELLED') AS orders,
           COUNT(*) FILTER (WHERE o.status = 'CANCELLED') AS cancelled,
           (SELECT COALESCE(SUM(oi.quantity), 0) FROM ${table("order_items")} oi
              JOIN ${table("orders")} o2 ON o2.id = oi.order_id JOIN ${table("branches")} b2 ON b2.id = o2.branch_id
             WHERE ${s.branchId ? Prisma.sql`o2.branch_id = ${s.branchId}` : Prisma.sql`b2.merchant_id = ${s.merchantId}`}
               AND o2.status <> 'CANCELLED' AND o2.created_at >= ${start} AND o2.created_at < ${end}) AS items
    FROM ${table("orders")} o JOIN ${table("branches")} b ON b.id = o.branch_id
    WHERE ${scopeSql(s)} AND o.created_at >= ${start} AND o.created_at < ${end}`;
  return { revenue: Number(row?.revenue ?? 0), orders: Number(row?.orders ?? 0), cancelled: Number(row?.cancelled ?? 0), items: Number(row?.items ?? 0) };
}

/** Revenue / orders per bucket ("HH" hour, "YYYY-MM-DD" day or "YYYY-MM" month, local time). */
async function series(s: SalesScope, r: Range, tz: string, g: ResolvedPeriod["granularity"]) {
  const { start, end } = bounds(r, tz);
  const local = Prisma.sql`((o.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})`;
  const bucket =
    g === "hour" ? Prisma.sql`to_char(${local}, 'HH24')` : g === "day" ? Prisma.sql`to_char(${local}, 'YYYY-MM-DD')` : Prisma.sql`to_char(${local}, 'YYYY-MM')`;
  const rows = await prisma.$queryRaw<{ k: string; revenue: string; orders: bigint }[]>`
    SELECT ${bucket} AS k, SUM(o.total_amount)::text AS revenue, COUNT(*) AS orders
    FROM ${table("orders")} o JOIN ${table("branches")} b ON b.id = o.branch_id
    WHERE ${scopeSql(s)} AND o.status <> 'CANCELLED' AND o.created_at >= ${start} AND o.created_at < ${end}
    GROUP BY 1`;
  return new Map(rows.map((x) => [x.k, { revenue: Number(x.revenue), orders: Number(x.orders) }]));
}

function bucketsOf(r: Range, g: ResolvedPeriod["granularity"]): string[] {
  if (g === "hour") return Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));
  if (g === "day") return Array.from({ length: days(r) }, (_, i) => addDays(r.from, i));
  const out: string[] = [];
  for (let d = monthStart(r.from); d <= r.to; d = shiftMonth(d, 1)) out.push(d.slice(0, 7));
  return out;
}

function bucketLabel(k: string, g: ResolvedPeriod["granularity"]) {
  if (g === "hour") return `${k}:00`;
  if (g === "day") return new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${k}T00:00:00Z`));
  return new Intl.DateTimeFormat("en-MY", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${k}-01T00:00:00Z`));
}

export async function salesReport(scope: SalesScope, period: ResolvedPeriod, tz: string, now = new Date()) {
  const { current: cur, previous: prev, granularity: g } = period;
  const { start, end } = bounds(cur, tz);
  const { start: pStart, end: pEnd } = bounds(prev, tz);
  const local = Prisma.sql`((o.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})`;

  const [t, pt, s, ps, items, prevItems, branches, heat] = await Promise.all([
    totals(scope, cur, tz),
    totals(scope, prev, tz),
    series(scope, cur, tz, g),
    series(scope, prev, tz, g),
    prisma.$queryRaw<{ name: string; qty: bigint; revenue: string }[]>`
      SELECT oi.menu_item_name_snapshot AS name, SUM(oi.quantity) AS qty, SUM(oi.subtotal)::text AS revenue
      FROM ${table("order_items")} oi JOIN ${table("orders")} o ON o.id = oi.order_id JOIN ${table("branches")} b ON b.id = o.branch_id
      WHERE ${scopeSql(scope)} AND o.status <> 'CANCELLED' AND o.created_at >= ${start} AND o.created_at < ${end}
      GROUP BY 1 ORDER BY 3 DESC LIMIT 10`,
    prisma.$queryRaw<{ name: string; revenue: string }[]>`
      SELECT oi.menu_item_name_snapshot AS name, SUM(oi.subtotal)::text AS revenue
      FROM ${table("order_items")} oi JOIN ${table("orders")} o ON o.id = oi.order_id JOIN ${table("branches")} b ON b.id = o.branch_id
      WHERE ${scopeSql(scope)} AND o.status <> 'CANCELLED' AND o.created_at >= ${pStart} AND o.created_at < ${pEnd}
      GROUP BY 1`,
    prisma.$queryRaw<{ branch_id: string; revenue: string; orders: bigint }[]>`
      SELECT o.branch_id, SUM(o.total_amount)::text AS revenue, COUNT(*) AS orders
      FROM ${table("orders")} o JOIN ${table("branches")} b ON b.id = o.branch_id
      WHERE ${scopeSql(scope)} AND o.status <> 'CANCELLED' AND o.created_at >= ${start} AND o.created_at < ${end}
      GROUP BY 1`,
    prisma.$queryRaw<{ dow: number; hour: number; revenue: string; orders: bigint }[]>`
      SELECT (EXTRACT(ISODOW FROM ${local})::int - 1) AS dow, EXTRACT(HOUR FROM ${local})::int AS hour,
             SUM(o.total_amount)::text AS revenue, COUNT(*) AS orders
      FROM ${table("orders")} o JOIN ${table("branches")} b ON b.id = o.branch_id
      WHERE ${scopeSql(scope)} AND o.status <> 'CANCELLED' AND o.created_at >= ${start} AND o.created_at < ${end}
      GROUP BY 1, 2`,
  ]);

  const keys = bucketsOf(cur, g);
  const prevKeys = bucketsOf(prev, g);
  const nowHour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone: tz }).format(now));
  const isToday = g === "hour" && cur.from === new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(now);
  const prevRev = new Map(prevItems.map((x) => [x.name, Number(x.revenue)]));

  const pct = (a: number, b: number) => (b > 0 ? a / b - 1 : null);
  const avg = (x: Totals) => (x.orders ? x.revenue / x.orders : 0);

  return {
    totals: t,
    previousTotals: pt,
    change: {
      revenue: pct(t.revenue, pt.revenue),
      orders: pct(t.orders, pt.orders),
      avg: pct(avg(t), avg(pt)),
      items: pct(t.items, pt.items),
    },
    avgOrder: avg(t),
    days: days(cur),
    series: keys.map((k) => ({ key: k, label: bucketLabel(k, g), value: s.get(k)?.revenue ?? 0, orders: s.get(k)?.orders ?? 0 })),
    // Previous period aligned bucket-by-bucket (same position), for the dashed comparison line.
    previousSeries: keys.map((_, i) => ps.get(prevKeys[i])?.revenue ?? 0),
    nowIndex: isToday ? nowHour : undefined,
    topItems: items.map((x) => {
      const revenue = Number(x.revenue);
      return { name: x.name, qty: Number(x.qty), revenue, share: t.revenue ? revenue / t.revenue : 0, change: pct(revenue, prevRev.get(x.name) ?? 0) };
    }),
    byBranch: new Map(branches.map((x) => [x.branch_id, { revenue: Number(x.revenue), orders: Number(x.orders) }])),
    heatmap: heat.map((x) => ({ dow: x.dow, hour: x.hour, revenue: Number(x.revenue), orders: Number(x.orders) })),
  };
}

/** Daily rows for CSV export: date, orders, revenue, cancelled. */
export async function dailyRows(scope: SalesScope, r: Range, tz: string) {
  const { start, end } = bounds(r, tz);
  const local = Prisma.sql`((o.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})`;
  const rows = await prisma.$queryRaw<{ day: string; orders: bigint; revenue: string; cancelled: bigint }[]>`
    SELECT to_char(${local}, 'YYYY-MM-DD') AS day,
           COUNT(*) FILTER (WHERE o.status <> 'CANCELLED') AS orders,
           COALESCE(SUM(o.total_amount) FILTER (WHERE o.status <> 'CANCELLED'), 0)::text AS revenue,
           COUNT(*) FILTER (WHERE o.status = 'CANCELLED') AS cancelled
    FROM ${table("orders")} o JOIN ${table("branches")} b ON b.id = o.branch_id
    WHERE ${scopeSql(scope)} AND o.created_at >= ${start} AND o.created_at < ${end}
    GROUP BY 1`;
  const by = new Map(rows.map((x) => [x.day, x]));
  return Array.from({ length: days(r) }, (_, i) => {
    const d = addDays(r.from, i);
    const x = by.get(d);
    return { date: d, orders: Number(x?.orders ?? 0), revenue: Number(x?.revenue ?? 0), cancelled: Number(x?.cancelled ?? 0) };
  });
}
