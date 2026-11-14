/**
 * Shared logic for demo data: filling empty fields with dummy values and
 * generating simulated order history. Used by scripts/simulate-history.ts and
 * scripts/check-data.ts. Every write here only fills what is EMPTY (null, empty
 * list, missing row, day without data) — existing values are never overwritten.
 */
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "../../lib/generated/prisma/client";
import type { BaseUnit, ExpenseCategory } from "../../lib/generated/prisma/enums";
import { prisma, table } from "../../lib/db";
import { costPerBaseUnit } from "../../lib/units";
import { addDays, dateColumn, dayRangeUtc, DEFAULT_TZ, localDate, zonedTimeToUtc } from "../../lib/time";
import { DEMO_COSTS, DEMO_EXPENSES, DEMO_HOURS, DEMO_MENU } from "../demo-catalog";

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/** A day counts as "has real history" once it has this many real (non-cancelled) orders. */
export const REAL_DAY_MIN_ORDERS = 20;
export const DUMMY_NOTE = "Dummy value — replace with your real figure";

// ─── store ─────────────────────────────────────────────────────────────

export async function storeInfo() {
  const s = await prisma.storeSetting.findUnique({ where: { id: 1 } });
  return {
    exists: !!s,
    name: s?.storeName ?? null,
    tz: s?.timezone || DEFAULT_TZ,
    openTime: s?.openTime ?? null,
    closeTime: s?.closeTime ?? null,
  };
}

// ─── dummy-value heuristics (only for items not in scripts/demo-catalog.ts) ──

const COST_HINTS: { re: RegExp; G?: string; ML?: string; PCS?: string }[] = [
  { re: /eggplant|terung/, G: "7.00" },
  { re: /prawn|udang|shrimp/, G: "38.00" },
  { re: /beef|daging|lamb|kambing|mutton/, G: "38.00" },
  { re: /chicken|ayam/, G: "11.00", PCS: "2.00" },
  { re: /fish|ikan|salmon|tuna|sotong|squid/, G: "22.00" },
  { re: /\begg|telur/, PCS: "0.45", G: "9.00" },
  { re: /butter|mentega|cheese|keju/, G: "36.00", PCS: "1.00" },
  { re: /coffee|kopi/, G: "35.00" },
  { re: /\btea\b|\bteh\b/, G: "30.00" },
  { re: /milo|cocoa|chocolate|coklat/, G: "30.00" },
  { re: /santan|coconut/, ML: "12.00", G: "10.00" },
  { re: /milk|susu|cream/, ML: "8.00", G: "12.00" },
  { re: /\boil\b|minyak/, ML: "7.00" },
  { re: /rice|beras|nasi/, G: "3.20" },
  { re: /noodle|\bmee\b|\bmi\b|kway|bihun|pasta|spaghetti/, G: "5.00" },
  { re: /flour|tepung/, G: "3.00" },
  { re: /sugar|gula/, G: "2.85", ML: "6.00" },
  { re: /salt|garam/, G: "1.50" },
  { re: /sauce|\bsos\b|kicap|soy|ketchup|mayo|sambal|chili|chilli|cili/, G: "12.00", ML: "8.00" },
  { re: /bread|roti|\bbun\b|\bpau\b/, PCS: "0.60", G: "8.00" },
  { re: /onion|bawang|garlic|ginger|halia/, G: "7.00" },
  { re: /lettuce|cabbage|kobis|sayur|vegetable|tomato|cucumber|timun|carrot|lobak|sprout|taugeh|tauge/, G: "6.00" },
  { re: /lime|limau|lemon|orange|oren|fruit|buah|banana|pisang/, PCS: "0.30", G: "8.00" },
  { re: /\bice\b|\bais\b/, G: "0.30" },
  { re: /water|air mineral/, PCS: "0.60", ML: "1.00" },
  { re: /cup|lid|straw|box|bag|packag|bekas/, PCS: "0.15" },
];
const UNIT_DEFAULT_COST: Record<BaseUnit, string> = { G: "10.00", ML: "8.00", PCS: "0.50" };
const DISPLAY_UNIT: Record<BaseUnit, "kg" | "L" | "pcs"> = { G: "kg", ML: "L", PCS: "pcs" };

/** Dummy cost per kg / L / pcs: demo catalog by SKU, else keyword guess, else unit default. */
export function dummyCost(i: { name: string; sku: string | null; unit: BaseUnit }): { perDisplayUnit: string; source: string } {
  if (i.sku && DEMO_COSTS[i.sku]) return { perDisplayUnit: DEMO_COSTS[i.sku], source: "demo catalog" };
  const name = i.name.toLowerCase();
  for (const h of COST_HINTS) {
    const v = h[i.unit];
    if (v && h.re.test(name)) return { perDisplayUnit: v, source: "name guess" };
  }
  return { perDisplayUnit: UNIT_DEFAULT_COST[i.unit], source: "unit default" };
}

export function dummyPreparedAhead(name: string, category: string): boolean {
  if (DEMO_MENU[name]) return DEMO_MENU[name].preparedAhead;
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (/nasi lemak|lemak/.test(n)) return true;
  if (/drink|minuman|beverage/.test(c) || /\bteh\b|kopi|coffee|\btea\b|latte|milo|juice|\bjus\b|\bais\b|soda|water/.test(n)) return false;
  // Cooked when ordered.
  if (/goreng|fried|bakar|grill|toast|burger|sandwich|omelette|telur|egg|fries|roti|char|kway teow|wok/.test(n)) return false;
  // Usually cooked in bulk in the morning.
  if (/nasi|rice|curry|kari|rendang|soup|\bsup\b|bubur|porridge|kuih|cendol|cake|\bkek\b|\bpau\b|lontong|laksa|briyani|biryani/.test(n)) return true;
  if (/dessert|pencuci|kuih/.test(c)) return true;
  return false;
}

export function dummyAliases(name: string): string[] {
  if (DEMO_MENU[name]) return DEMO_MENU[name].aliases;
  const base = name.toLowerCase().replace(/\(.*?\)/g, " ").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  const words = base.split(/[\s-]+/).filter(Boolean);
  const out = new Set<string>();
  if (words.length >= 3) out.add(words.slice(0, 2).join(" "));
  // The most distinctive single word, e.g. "Iced Latte" → "latte", "Nasi Kandar" → "kandar".
  const generic = new Set(["nasi", "mee", "mi", "roti", "teh", "kopi", "ais", "iced", "hot", "panas", "set", "special", "with", "and", "the"]);
  const key = words.filter((w) => w.length >= 4 && !generic.has(w)).sort((a, b) => b.length - a.length)[0];
  if (words.length >= 2 && key) out.add(key);
  if (words.length >= 2) out.add(words.map((w) => w[0]).join(""));
  out.delete(base);
  if (out.size === 0 && base && base !== name.toLowerCase()) out.add(base);
  return [...out].filter((a) => a.length >= 2).slice(0, 5);
}

// ─── fill empty fields ─────────────────────────────────────────────────

export type FieldChange = {
  table: "ingredients" | "menu_items" | "store_settings";
  id: string;
  label: string;
  field: "costPerUnit" | "isPreparedAhead" | "aliases" | "openTime" | "closeTime";
  before: string | boolean | string[] | null;
  after: string | boolean | string[] | null;
  note?: string;
};

export type FillResult = {
  fields: FieldChange[];
  createdStoreSettings: boolean;
  insertedExpenseIds: string[];
  insertedExpenseCategories: ExpenseCategory[];
};

/**
 * Fill empty fields with dummy values. Never overwrites a value that is set.
 * - ingredients.cost_per_unit (null)
 * - menu_items.is_prepared_ahead (null) and aliases (empty)
 * - store_settings row / open_time / close_time (null)
 * - expenses: demo running costs for each category that has none at all
 */
export async function fillEmptyFields(opts: { windowDays: number }): Promise<FillResult> {
  const fields: FieldChange[] = [];

  const ings = await prisma.ingredient.findMany({ where: { costPerUnit: null }, orderBy: { name: "asc" } });
  for (const i of ings) {
    const guess = dummyCost(i);
    const perBase = costPerBaseUnit(guess.perDisplayUnit, DISPLAY_UNIT[i.unit], i.unit)!;
    const res = await prisma.ingredient.updateMany({ where: { id: i.id, costPerUnit: null }, data: { costPerUnit: perBase } });
    if (res.count) {
      fields.push({
        table: "ingredients",
        id: i.id,
        label: i.name,
        field: "costPerUnit",
        before: null,
        after: perBase.toString(),
        note: `RM ${guess.perDisplayUnit}/${DISPLAY_UNIT[i.unit]} (${guess.source})`,
      });
    }
  }

  const items = await prisma.menuItem.findMany({
    where: { isArchived: false, OR: [{ isPreparedAhead: null }, { aliases: { isEmpty: true } }] },
    include: { category: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  for (const m of items) {
    if (m.isPreparedAhead === null) {
      const v = dummyPreparedAhead(m.name, m.category.name);
      const res = await prisma.menuItem.updateMany({ where: { id: m.id, isPreparedAhead: null }, data: { isPreparedAhead: v } });
      if (res.count) {
        fields.push({
          table: "menu_items",
          id: m.id,
          label: m.name,
          field: "isPreparedAhead",
          before: null,
          after: v,
          note: v ? "prepared ahead" : "made to order",
        });
      }
    }
    if (m.aliases.length === 0) {
      const v = dummyAliases(m.name);
      if (v.length) {
        const res = await prisma.menuItem.updateMany({ where: { id: m.id, aliases: { isEmpty: true } }, data: { aliases: v } });
        if (res.count) fields.push({ table: "menu_items", id: m.id, label: m.name, field: "aliases", before: [], after: v });
      }
    }
  }

  let createdStoreSettings = false;
  const s = await prisma.storeSetting.findUnique({ where: { id: 1 } });
  if (!s) {
    await prisma.storeSetting.create({ data: { id: 1, ...DEMO_HOURS } });
    createdStoreSettings = true;
    fields.push({ table: "store_settings", id: "1", label: "Store", field: "openTime", before: null, after: DEMO_HOURS.openTime });
    fields.push({ table: "store_settings", id: "1", label: "Store", field: "closeTime", before: null, after: DEMO_HOURS.closeTime });
  } else {
    for (const f of ["openTime", "closeTime"] as const) {
      if (!s[f]) {
        await prisma.storeSetting.update({ where: { id: 1 }, data: { [f]: DEMO_HOURS[f] } });
        fields.push({ table: "store_settings", id: "1", label: "Store", field: f, before: null, after: DEMO_HOURS[f] });
      }
    }
  }

  // Running costs: add the demo entries for every category that has none yet.
  const existingCats = new Set((await prisma.expense.groupBy({ by: ["category"] })).map((g) => g.category));
  const missing = DEMO_EXPENSES.filter((e) => !existingCats.has(e.category));
  const tz = (await storeInfo()).tz;
  const start = `${addDays(localDate(new Date(), tz), -opts.windowDays).slice(0, 7)}-01`;
  const insertedExpenseIds: string[] = [];
  for (const e of missing) {
    const row = await prisma.expense.create({
      data: { ...e, startDate: dateColumn(start), notes: DUMMY_NOTE, isSimulated: true },
      select: { id: true },
    });
    insertedExpenseIds.push(row.id);
  }

  return {
    fields,
    createdStoreSettings,
    insertedExpenseIds,
    insertedExpenseCategories: [...new Set(missing.map((e) => e.category))],
  };
}

// ─── history coverage ──────────────────────────────────────────────────

export type DayCoverage = { day: string; real: number; sim: number };

/** Per local day in [today - windowDays, today): real and simulated order counts. */
export async function historyCoverage(windowDays: number, tz: string) {
  const today = localDate(new Date(), tz);
  const first = addDays(today, -windowDays);
  const start = dayRangeUtc(first, tz).start;
  const end = dayRangeUtc(today, tz).start;
  const rows = await prisma.$queryRaw<{ day: string; real: bigint; sim: bigint }[]>`
    SELECT ((o.created_at AT TIME ZONE 'UTC') AT TIME ZONE ${tz})::date::text AS day,
           COUNT(*) FILTER (WHERE NOT o.is_simulated AND o.status <> 'CANCELLED') AS real,
           COUNT(*) FILTER (WHERE o.is_simulated) AS sim
    FROM ${table("orders")} o
    WHERE o.created_at >= ${start} AND o.created_at < ${end}
    GROUP BY 1`;
  const byDay = new Map(rows.map((r) => [r.day, { real: Number(r.real), sim: Number(r.sim) }]));
  const days: DayCoverage[] = [];
  for (let d = first; d < today; d = addDays(d, 1)) days.push({ day: d, ...(byDay.get(d) ?? { real: 0, sim: 0 }) });
  const hasData = (c: DayCoverage) => c.sim > 0 || c.real >= REAL_DAY_MIN_ORDERS;
  const perWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const c of days) if (hasData(c)) perWeekday[new Date(`${c.day}T00:00:00Z`).getUTCDay()]++;
  return {
    today,
    first,
    last: addDays(today, -1),
    days,
    needing: days.filter((c) => !hasData(c)).map((c) => c.day),
    withData: days.filter(hasData).length,
    minPerWeekday: Math.min(...perWeekday),
  };
}

// ─── simulation (real-data patterns) ───────────────────────────────────
//
// Demand for item i on local date d:
//   base_i × weekday_i(d) × swing_i(d) × JB season(month) × JB crowd wave(d) × F&B trend(d)
// • base_i       shop size from DOSM (revenue per F&B worker per day × staff), split by the
//                Indonesian POS food/snack/drink mix, then by item popularity weights
// • weekday_i    Yaz restaurant day-of-week shape (by dish type; drinks use Yaz TOTAL)
// • swing_i      real day-to-day swings: Yaz per dish (food), Indonesian POS (drinks)
// • season       Imigresen Singapore → Johor arrivals by calendar month (JB exposure 0.5)
// • wave         KTMB Tebrau shuttle ridership on that exact date vs its usual weekday (exposure 0.5)
// • trend        DOSM F&B revenue by quarter, relative to the latest quarter
// Order times follow the Indonesian POS hour curve; order sizes its items-per-receipt split.
// Everything generated is flagged is_simulated = true.

/** 32-bit FNV-1a, used to give each day / item its own deterministic random stream. */
function hash32(s: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rng(seed: string) {
  const rand = mulberry32(hash32(seed));
  return {
    rand,
    between: (lo: number, hi: number) => lo + (hi - lo) * rand(),
    pick: <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)],
  };
}

export type RealPatterns = {
  version: number;
  generatedAt: string;
  attribution: string;
  sources: { key: string; name: string; citation: string; url: string; license: string; used: string }[];
  yaz: { days: number; from: string; to: string; dow: Record<string, number[]>; residual: Record<string, number[]>; share: Record<string, number> };
  indonesia: {
    receipts: number;
    from: string;
    to: string;
    basket: Record<string, number>;
    mix: { main: number; snack: number; drink: number };
    hourly: { weekday: number[]; weekend: number[] };
    dailyResidual: number[];
  };
  malaysia: {
    fb: { quarters: number; latestQuarter: string; revenuePerEmployeeDay: number; trend: { quarter: string; index: number }[] };
    arrivals: { from: string; to: string; seasonByMonth: number[] };
    ktmb: { from: string; to: string; wave: Record<string, number> };
  };
};

let patternsCache: RealPatterns | null = null;
export function loadPatterns(): RealPatterns {
  if (patternsCache) return patternsCache;
  const file = path.join(process.cwd(), "data", "real-patterns.json");
  if (!fs.existsSync(file)) {
    throw new Error("data/real-patterns.json is missing. Run `npm run patterns:build -- --source=<bossbuddy-public-data folder>`.");
  }
  patternsCache = JSON.parse(fs.readFileSync(file, "utf8")) as RealPatterns;
  return patternsCache;
}

/** How strongly a JB shop follows Singapore cross-border swings (0 = not at all, 1 = fully). */
const JB_EXPOSURE = 0.5;

export type ItemGroup = "main" | "snack" | "drink";

export function itemGroup(name: string, category: string): ItemGroup {
  const n = name.toLowerCase();
  const c = category.toLowerCase();
  if (/drink|minuman|beverage|coffee|tea/.test(c) || /\bteh\b|kopi|milo|latte|coffee|\btea\b|juice|\bjus\b|\bais\b|limau|water|soda|sirap/.test(n)) return "drink";
  if (/breakfast|sarapan|dessert|pencuci|side|snack|kuih/.test(c) || /fries|roti|kuih|cendol|\begg|telur|cake|\bkek\b|pisang/.test(n)) return "snack";
  return "main";
}

/** Which Yaz dish's weekday shape and swings a food item follows. */
export function yazProfile(name: string): string {
  const n = name.toLowerCase();
  if (/chicken|ayam/.test(n)) return "HAEHNCHEN";
  if (/prawn|udang|shrimp|kway teow/.test(n)) return "GARNELEN";
  if (/calamari|sotong|squid/.test(n)) return "CALAMARI";
  if (/fish|ikan/.test(n)) return "FISCH";
  if (/lamb|kambing|mutton/.test(n)) return "LAMM";
  if (/kofta|kofte|meatball|bebola/.test(n)) return "KOEFTE";
  if (/beef|daging|steak/.test(n)) return "STEAK";
  return "TOTAL";
}

const dayNumber = (d: string) => Math.round(Date.parse(`${d}T00:00:00Z`) / 864e5);
/** Monday = 0 … Sunday = 6 */
const mon0 = (d: string) => (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;

/** DOSM trend index at a date (linear between quarter midpoints), relative to `ref`. */
function trendFactor(p: RealPatterns, d: string, ref: string) {
  const pts = p.malaysia.fb.trend.map((q) => ({ t: dayNumber(q.quarter) + 45, v: q.index }));
  const at = (day: string) => {
    const t = dayNumber(day);
    if (t <= pts[0].t) return pts[0].v;
    if (t >= pts[pts.length - 1].t) return pts[pts.length - 1].v;
    const i = pts.findIndex((x) => x.t >= t);
    const a = pts[i - 1];
    const b = pts[i];
    return a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);
  };
  return at(d) / at(ref);
}

/** Market factors shared by all items on a date (season × crowd wave × trend). */
export function marketFactor(p: RealPatterns, d: string, today: string) {
  const season = 1 + JB_EXPOSURE * (p.malaysia.arrivals.seasonByMonth[Number(d.slice(5, 7)) - 1] - 1);
  const w = p.malaysia.ktmb.wave[d];
  const wave = w ? Math.min(1.5, Math.max(0.7, 1 + JB_EXPOSURE * (w - 1))) : 1;
  return { season, wave, trend: trendFactor(p, d, today) };
}

/** Number of staff the shop is sized for: active salary entries in Costs (EPF/SOCSO lines excluded), else 4. */
export async function staffCount(today: string): Promise<number> {
  const rows = await prisma.expense.findMany({
    where: { category: "STAFF", startDate: { lte: dateColumn(today) }, OR: [{ endDate: null }, { endDate: { gte: dateColumn(today) } }] },
    select: { name: true },
  });
  const n = rows.filter((r) => !/epf|socso|eis|kwsp|perkeso/i.test(r.name)).length;
  return n || 4;
}

const NAMES = [
  "Aisyah", "Ahmad", "Nurul", "Hafiz", "Siti", "Farah", "Amir", "Jason", "Wei Ming", "Mei Ling",
  "Kumar", "Priya", "Arun", "Kavitha", "Daniel", "Sarah", "Lim", "Tan", "Raj", "Zainab", "Irfan", "Hui Min",
];

const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const hhmmOf = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** Hour weights from the Indonesian POS curve, limited to the shop's opening hours. */
function hourWeights(curve: number[], open: number, close: number) {
  const floor = Math.min(...curve.filter((x) => x > 0)) * 0.5; // hours the source shops weren't open
  return Array.from({ length: 24 }, (_, h) => {
    const overlap = Math.max(0, Math.min(close, (h + 1) * 60) - Math.max(open, h * 60)) / 60;
    return overlap * (curve[h] > 0 ? curve[h] : floor);
  });
}

function sampleMinute(r: ReturnType<typeof rng>, weights: number[], open: number, close: number) {
  const total = weights.reduce((a, b) => a + b, 0);
  let x = r.rand() * total;
  let h = 0;
  for (; h < 23; h++) {
    if ((x -= weights[h]) <= 0) break;
  }
  const lo = Math.max(open, h * 60);
  const hi = Math.min(close - 1, h * 60 + 59);
  return Math.round(lo + r.rand() * Math.max(0, hi - lo));
}

/** Round randomly so small expected values aren't always rounded down. */
const stochasticRound = (x: number, r: ReturnType<typeof rng>) => Math.floor(x) + (r.rand() < x - Math.floor(x) ? 1 : 0);

export type SimulationResult = {
  days: string[];
  orders: number;
  plates: number;
  prepRows: number;
  soldOuts: number;
  missed: number;
  staff: number;
  targetRevenuePerDay: number;
};

/**
 * Generate simulated orders (+ items, ingredient snapshots), daily_prep for
 * prepared-ahead items, and sold-out events for the given local dates, using the
 * real-data patterns in data/real-patterns.json. Deterministic per day. Never
 * changes stock or inventory_movements; never replaces real daily_prep rows.
 */
export async function simulateDays(days: string[], opts: { windowDays: number; seed?: string; staff?: number }): Promise<SimulationResult> {
  const p = loadPatterns();
  const seed = opts.seed ?? "pos-demo";
  const store = await storeInfo();
  const tz = store.tz;
  const open = minutesOf(store.openTime ?? DEMO_HOURS.openTime);
  const close = minutesOf(store.closeTime ?? DEMO_HOURS.closeTime);
  if (close - open < 120) throw new Error("Opening hours are shorter than 2 hours; set open/close time in Settings.");
  const today = localDate(new Date(), tz);
  const staff = opts.staff ?? (await staffCount(today));
  const targetRevenuePerDay = p.malaysia.fb.revenuePerEmployeeDay * staff;
  const empty = { days, orders: 0, plates: 0, prepRows: 0, soldOuts: 0, missed: 0, staff, targetRevenuePerDay };
  if (days.length === 0) return empty;

  const items = await prisma.menuItem.findMany({
    where: { isArchived: false },
    include: {
      category: { select: { name: true } },
      recipe: { include: { ingredient: { select: { id: true, name: true, unit: true } } } },
    },
  });
  if (!items.length) throw new Error("No menu items. Run `npm run db:seed` first.");

  // ── Shop size: units per day so that average revenue matches DOSM × staff ──
  const groups = new Map<ItemGroup, typeof items>();
  for (const m of items) {
    const g = itemGroup(m.name, m.category.name);
    groups.set(g, [...(groups.get(g) ?? []), m]);
  }
  const mixSum = [...groups.keys()].reduce((s, g) => s + p.indonesia.mix[g], 0);
  const weightOf = (m: (typeof items)[number]) => DEMO_MENU[m.name]?.baseDemand ?? 10;
  const share = new Map<string, number>(); // share of all units sold
  for (const [g, list] of groups) {
    const wsum = list.reduce((s, m) => s + weightOf(m), 0);
    for (const m of list) share.set(m.id, (p.indonesia.mix[g] / mixSum) * (weightOf(m) / wsum));
  }
  const avgPrice = items.reduce((s, m) => s + share.get(m.id)! * Number(m.price), 0);
  const unitsPerDay = targetRevenuePerDay / Math.max(0.5, avgPrice);

  const profile = new Map(
    items.map((m) => {
      const group = itemGroup(m.name, m.category.name);
      const yaz = group === "drink" ? "TOTAL" : yazProfile(m.name);
      return [
        m.id,
        {
          group,
          dow: p.yaz.dow[yaz],
          swing: group === "drink" ? p.indonesia.dailyResidual : p.yaz.residual[yaz],
          base: unitsPerDay * share.get(m.id)!,
          // Staff habit: a fixed weekday and weekend amount with a safety buffer (+10–30%).
          // It ignores busy Saturdays, holidays and JB crowd waves — that's what forecasting can fix.
          prepBias: rng(`${seed}|bias|${m.id}`).between(1.1, 1.3),
        },
      ];
    }),
  );

  const basket = Object.entries(p.indonesia.basket).map(([k, v]) => ({ size: Number(k), p: v }));
  const pickBasket = (r: ReturnType<typeof rng>) => {
    let x = r.rand();
    for (const b of basket) if ((x -= b.p) <= 0) return b.size;
    return basket[basket.length - 1].size;
  };
  const weekdayHours = hourWeights(p.indonesia.hourly.weekday, open, close);
  const weekendHours = hourWeights(p.indonesia.hourly.weekend, open, close);

  const realPrep = await prisma.dailyPrep.findMany({
    where: { date: { in: days.map(dateColumn) }, isSimulated: false },
    select: { date: true, menuItemId: true },
  });
  const realPrepKeys = new Set(realPrep.map((x) => `${x.date.toISOString().slice(0, 10)}|${x.menuItemId}`));

  const orders: Prisma.OrderCreateManyInput[] = [];
  const orderItems: Prisma.OrderItemCreateManyInput[] = [];
  const orderIngs: Prisma.OrderIngredientCreateManyInput[] = [];
  const preps: Prisma.DailyPrepCreateManyInput[] = [];
  const soldOuts: Prisma.SoldOutEventCreateManyInput[] = [];
  const byItem = new Map(items.map((m) => [m.id, m]));
  let missed = 0;

  for (const day of [...days].sort()) {
    const r = rng(`${seed}|${day}`);
    const w = mon0(day);
    const weekend = w >= 5;
    const mk = marketFactor(p, day, today);
    const market = mk.season * mk.wave * mk.trend;
    const hours = weekend ? weekendHours : weekdayHours;
    const units: { itemId: string; minute: number }[] = [];

    for (const m of items) {
      const pr = profile.get(m.id)!;
      const swing = pr.swing[((dayNumber(day) % pr.swing.length) + pr.swing.length) % pr.swing.length];
      const demand = stochasticRound(pr.base * pr.dow[w] * swing * market, r);
      const times = Array.from({ length: demand }, () => sampleMinute(r, hours, open, close)).sort((a, b) => a - b);
      let sellable = times;
      if (m.isPreparedAhead) {
        const usual = weekend ? (pr.dow[5] + pr.dow[6]) / 2 : (pr.dow[0] + pr.dow[1] + pr.dow[2] + pr.dow[3] + pr.dow[4]) / 5;
        const plates = Math.max(0, Math.round(pr.base * usual * mk.season * mk.trend * pr.prepBias));
        if (!realPrepKeys.has(`${day}|${m.id}`)) {
          preps.push({ id: randomUUID(), date: dateColumn(day), menuItemId: m.id, platesPrepared: plates, isSimulated: true });
        }
        // Every plate sold → item sold out (staff switch it off); extra demand is missed.
        if (plates > 0 && times.length >= plates) {
          sellable = times.slice(0, plates);
          missed += times.length - plates;
          soldOuts.push({
            id: randomUUID(),
            menuItemId: m.id,
            soldOutAt: zonedTimeToUtc(day, hhmmOf(Math.min(close - 1, sellable[plates - 1] + Math.round(r.between(2, 12)))), tz),
            isSimulated: true,
          });
        }
      }
      for (const minute of sellable) units.push({ itemId: m.id, minute });
    }

    units.sort((a, b) => a.minute - b.minute);
    for (let i = 0; i < units.length; ) {
      const group = units.slice(i, i + pickBasket(r));
      i += group.length;
      const createdAt = new Date(zonedTimeToUtc(day, hhmmOf(group[0].minute), tz).getTime() + Math.floor(r.rand() * 60) * 1000);
      const orderId = randomUUID();
      const qty = new Map<string, number>();
      for (const u of group) qty.set(u.itemId, (qty.get(u.itemId) ?? 0) + 1);
      let total: Decimal = new D(0);
      const usage = new Map<string, { qty: Decimal; name: string; unit: BaseUnit }>();
      for (const [itemId, q] of qty) {
        const m = byItem.get(itemId)!;
        const subtotal = m.price.mul(q);
        total = total.add(subtotal);
        orderItems.push({
          id: randomUUID(),
          orderId,
          menuItemId: itemId,
          menuItemNameSnapshot: m.name,
          quantity: q,
          unitPriceSnapshot: m.price,
          subtotal,
        });
        for (const rl of m.recipe) {
          const need = rl.quantityRequired.mul(q);
          const u = usage.get(rl.ingredientId);
          if (u) u.qty = u.qty.add(need);
          else usage.set(rl.ingredientId, { qty: need, name: rl.ingredient.name, unit: rl.ingredient.unit });
        }
      }
      for (const [ingredientId, u] of usage) {
        orderIngs.push({
          id: randomUUID(),
          orderId,
          ingredientId,
          ingredientNameSnapshot: u.name,
          unitSnapshot: u.unit,
          quantityDeducted: u.qty,
        });
      }
      orders.push({
        id: orderId,
        customerName: r.pick(NAMES),
        tableNumber: r.rand() < 0.7 ? String(1 + Math.floor(r.rand() * 12)) : null,
        status: "COMPLETED",
        paymentStatus: "PAID",
        totalAmount: total,
        idempotencyKey: `sim-${orderId}`,
        requestHash: "simulated",
        isSimulated: true,
        createdAt,
        updatedAt: new Date(createdAt.getTime() + Math.round(r.between(8, 25)) * 60_000),
      });
    }
  }

  // Chronological insert so order numbers follow time within the simulated block.
  orders.sort((a, b) => (a.createdAt as Date).getTime() - (b.createdAt as Date).getTime());
  const chunk = async <T>(rows: T[], fn: (c: T[]) => Promise<unknown>, size = 1000) => {
    for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size));
  };
  await chunk(orders, (c) => prisma.order.createMany({ data: c }));
  await chunk(orderItems, (c) => prisma.orderItem.createMany({ data: c }));
  await chunk(orderIngs, (c) => prisma.orderIngredient.createMany({ data: c }));
  await chunk(preps, (c) => prisma.dailyPrep.createMany({ data: c, skipDuplicates: true }));
  await chunk(soldOuts, (c) => prisma.soldOutEvent.createMany({ data: c }));

  return {
    days,
    orders: orders.length,
    plates: orderItems.reduce((n, i) => n + (i.quantity as number), 0),
    prepRows: preps.length,
    soldOuts: soldOuts.length,
    missed,
    staff,
    targetRevenuePerDay,
  };
}

// ─── removal ───────────────────────────────────────────────────────────

/**
 * Delete simulated orders / prep / sold-out events — all of them, or only for
 * the given local dates. Optionally also the demo running costs.
 */
export async function removeSimulated(opts: { days?: string[]; expenses?: boolean } = {}) {
  const tz = (await storeInfo()).tz;
  let orderWhere: Prisma.OrderWhereInput = { isSimulated: true };
  let soldOutWhere: Prisma.SoldOutEventWhereInput = { isSimulated: true };
  let prepWhere: Prisma.DailyPrepWhereInput = { isSimulated: true };
  if (opts.days) {
    if (opts.days.length === 0) return { orders: 0, prep: 0, soldOuts: 0, expenses: 0 };
    const ranges = opts.days.map((d) => dayRangeUtc(d, tz));
    orderWhere = { isSimulated: true, OR: ranges.map((r) => ({ createdAt: { gte: r.start, lt: r.end } })) };
    soldOutWhere = { isSimulated: true, OR: ranges.map((r) => ({ soldOutAt: { gte: r.start, lt: r.end } })) };
    prepWhere = { isSimulated: true, date: { in: opts.days.map(dateColumn) } };
  }
  const ids = (await prisma.order.findMany({ where: orderWhere, select: { id: true } })).map((o) => o.id);
  for (let i = 0; i < ids.length; i += 1000) {
    const c = ids.slice(i, i + 1000);
    await prisma.orderIngredient.deleteMany({ where: { orderId: { in: c } } });
    await prisma.orderItem.deleteMany({ where: { orderId: { in: c } } });
    await prisma.inventoryMovement.deleteMany({ where: { orderId: { in: c } } }); // none expected
    await prisma.order.deleteMany({ where: { id: { in: c } } });
  }
  const prep = await prisma.dailyPrep.deleteMany({ where: prepWhere });
  const so = await prisma.soldOutEvent.deleteMany({ where: soldOutWhere });
  const ex = opts.expenses ? await prisma.expense.deleteMany({ where: { isSimulated: true } }) : { count: 0 };
  return { orders: ids.length, prep: prep.count, soldOuts: so.count, expenses: ex.count };
}
