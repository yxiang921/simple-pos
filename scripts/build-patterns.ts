/**
 * Build data/real-patterns.json from the BossBuddy public datasets.
 *
 *   npm run patterns:build -- --source="E:\path\to\bossbuddy-public-data"
 *   (or set BOSSBUDDY_DATA_DIR)
 *
 * Principle (from the datasets' README): borrow real PATTERNS — day of week,
 * time of day, seasons, day-to-day swings — never the sales volumes. The shop
 * built from these stays simulated (is_simulated = true) and screens must say so.
 *
 * Output is small (~60 KB) and committed, so the raw CSVs aren't needed at runtime.
 */
import fs from "node:fs";
import path from "node:path";

const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.join("=") || "true"] as const;
  }),
);
const SOURCE = path.resolve(args.get("source") ?? process.env.BOSSBUDDY_DATA_DIR ?? "../bossbuddy-public-data");
const OUT = path.join(process.cwd(), "data", "real-patterns.json");

// ─── tiny CSV reader (quotes + custom delimiter) ───────────────────────

function readCsv(file: string, delimiter = ","): Record<string, string>[] {
  const text = fs.readFileSync(path.join(SOURCE, file), "utf8").replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dayIndex = (s: string) => Math.round(Date.parse(`${s}T00:00:00Z`) / 864e5);
/** Monday = 0 … Sunday = 6 */
const weekday = (s: string) => (new Date(`${s}T00:00:00Z`).getUTCDay() + 6) % 7;

/** value / centred rolling mean — removes trend and seasons, keeps day-to-day swings. */
function rollingRatio(values: number[], window = 28) {
  const half = Math.floor(window / 2);
  return values.map((v, i) => {
    const slice = values.slice(Math.max(0, i - half), Math.min(values.length, i + half + 1));
    const m = mean(slice);
    return m > 0 ? v / m : 1;
  });
}

// ─── 1. Yaz restaurant (Germany): day-of-week shape + daily swings per dish ─

function yaz() {
  const rows = readCsv("1-yaz-restaurant-germany/data_preprocessed.csv", ";").map((r): Record<string, string> => {
    const [m, d, y] = r.DEMAND_DATE.split(".").map(Number); // M.D.YYYY
    return { ...r, date: iso(new Date(Date.UTC(y, m - 1, d))) };
  });
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const dishes = ["CALAMARI", "FISCH", "GARNELEN", "HAEHNCHEN", "KOEFTE", "LAMM", "STEAK", "TOTAL"];
  const dow: Record<string, number[]> = {};
  const residual: Record<string, number[]> = {};
  const share: Record<string, number> = {};
  const total = mean(rows.map((r) => Number(r.TOTAL)));
  for (const k of dishes) {
    const v = rows.map((r) => Number(r[k]));
    const m = mean(v);
    share[k] = r3(m / total);
    dow[k] = [0, 1, 2, 3, 4, 5, 6].map((w) => r3(mean(rows.filter((r) => weekday(r.date) === w).map((r) => Number(r[k]))) / m));
    // Day-to-day swing with the weekday shape and the German seasons/trend removed.
    // German public holidays are calendar-specific, so they're neutralised (1.0).
    const deweek = v.map((x, i) => x / dow[k][weekday(rows[i].date)]);
    residual[k] = rollingRatio(deweek).map((x, i) => (rows[i].ISHOLIDAY === "1" ? 1 : r3(Math.min(2.5, Math.max(0.2, x)))));
  }
  return { days: rows.length, from: rows[0].date, to: rows[rows.length - 1].date, dow, residual, share };
}

// ─── 2. Indonesian F&B POS: basket size, food/drink mix, hour curve, daily swings ─

function indonesia() {
  const tx = readCsv("2-indonesia-fnb-pos/Transactions.csv");
  const products = readCsv("2-indonesia-fnb-pos/Products.csv");
  const byFull = new Map(products.map((p) => [p.Variant === "-" ? p.ProductName : `${p.ProductName} (${p.Variant})`, p.Category]));
  const byName = new Map(products.map((p) => [p.ProductName, p.Category]));
  const group = (cat: string) => (cat === "Menu Gedhe" ? "main" : cat === "Snacks" ? "snack" : cat === "Add on" ? null : "drink");

  const basket = new Map<number, number>();
  const mix = { main: 0, snack: 0, drink: 0 };
  const hours = { weekday: new Array(24).fill(0), weekend: new Array(24).fill(0) };
  const daily = new Map<string, number>();
  for (const t of tx) {
    basket.set(Number(t.TotalItem), (basket.get(Number(t.TotalItem)) ?? 0) + 1);
    for (const item of t.Items.split(", ").map((s) => s.trim())) {
      const cat = byFull.get(item) ?? byName.get(item) ?? byName.get(item.split(" (")[0]) ?? "Other";
      const g = group(cat);
      if (g) mix[g]++;
    }
    const h = Number(t.Time.slice(0, 2));
    (weekday(t.Date) >= 5 ? hours.weekend : hours.weekday)[h]++;
    daily.set(t.Date, (daily.get(t.Date) ?? 0) + 1);
  }
  const n = tx.length;
  const mixTotal = mix.main + mix.snack + mix.drink;
  const norm = (a: number[]) => {
    const s = a.reduce((x, y) => x + y, 0);
    return a.map((x) => r3(x / s));
  };
  const dates = [...daily.keys()].sort();
  return {
    receipts: n,
    from: dates[0],
    to: dates[dates.length - 1],
    basket: Object.fromEntries([...basket.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => [k, r3(v / n)])),
    mix: { main: r3(mix.main / mixTotal), snack: r3(mix.snack / mixTotal), drink: r3(mix.drink / mixTotal) },
    hourly: { weekday: norm(hours.weekday), weekend: norm(hours.weekend) },
    dailyResidual: rollingRatio(dates.map((d) => daily.get(d)!)).map((x) => r3(Math.min(2, Math.max(0.3, x)))),
  };
}

// ─── 3. Malaysia official: scale, trend, seasons, JB crossings ─────────

function malaysia() {
  const fb = readCsv("3-malaysia-official/dosm_services_subsector.csv")
    .filter((r) => r.subsector === "56")
    .map((r) => ({ quarter: r.date, revenue: Number(r.revenue), employees: Number(r.employees) }))
    .sort((a, b) => a.quarter.localeCompare(b.quarter));
  const last4 = fb.slice(-4);
  // Revenue per F&B worker per day over the latest four quarters (RM).
  const revenuePerEmployeeDay = Math.round(last4.reduce((s, q) => s + q.revenue / q.employees, 0) / 365);
  const latest = fb[fb.length - 1].revenue;
  const trend = fb.filter((q) => q.quarter >= "2022-01-01").map((q) => ({ quarter: q.quarter, index: r3(q.revenue / latest) }));

  // Singapore residents entering Johor, by month → seasonal index per calendar month.
  const arr = readCsv("3-malaysia-official/immigration_arrivals_soe.csv")
    .filter((r) => r.country === "SGP" && r.soe === "Johor" && r.date >= "2023-01-01")
    .map((r) => ({ month: r.date.slice(0, 7), arrivals: Number(r.arrivals) }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const ratio = rollingRatio(arr.map((a) => a.arrivals), 12);
  const byMonth: number[][] = Array.from({ length: 12 }, () => []);
  arr.forEach((a, i) => byMonth[Number(a.month.slice(5)) - 1].push(ratio[i]));
  const seasonRaw = byMonth.map((xs) => mean(xs));
  const seasonMean = mean(seasonRaw);
  const season = seasonRaw.map((x) => r3(x / seasonMean));

  // KTMB Tebrau shuttle (JB ↔ Woodlands): ridership vs the same weekday over the previous 8 weeks.
  const k = readCsv("3-malaysia-official/ktmb_ridership_daily.csv")
    .filter((r) => r.service === "shuttle_tebrau")
    .map((r) => ({ date: r.date, n: Number(r.ridership) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const byDay = new Map(k.map((r) => [dayIndex(r.date), r.n]));
  const wave: Record<string, number> = {};
  for (const r of k) {
    const d = dayIndex(r.date);
    const prev = [1, 2, 3, 4, 5, 6, 7, 8].map((w) => byDay.get(d - 7 * w)).filter((x): x is number => !!x);
    if (prev.length >= 4 && r.n > 0) wave[r.date] = r3(r.n / mean(prev));
  }
  return {
    fb: { quarters: fb.length, latestQuarter: fb[fb.length - 1].quarter, revenuePerEmployeeDay, trend },
    arrivals: { from: arr[0].month, to: arr[arr.length - 1].month, seasonByMonth: season },
    ktmb: { from: k[0].date, to: k[k.length - 1].date, wave },
  };
}

function main() {
  if (!fs.existsSync(SOURCE)) throw new Error(`Source folder not found: ${SOURCE}. Pass --source="…/bossbuddy-public-data".`);
  console.log(`Reading ${SOURCE}`);
  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: "Patterns only (no sales volumes). Shops simulated from these must be labelled simulated.",
    attribution:
      "Simulated shop. Patterns from Yaz restaurant sales data (Taigel 2019, Mendeley Data, CC BY 4.0) and an Indonesian F&B POS dataset (Engel et al. 2026, Mendeley Data, CC BY 4.0). Malaysian scale and JB crossings from DOSM, Imigresen and KTMB via data.gov.my (CC BY 4.0).",
    sources: [
      { key: "yaz", name: "Restaurant Sales Data with Features (Yaz, Stuttgart)", citation: "Taigel, F. (2019). Mendeley Data, V1. doi:10.17632/xv5kp6mxv7.1", url: "https://data.mendeley.com/datasets/xv5kp6mxv7", license: "CC BY 4.0", used: "Day-of-week shape and day-to-day swings per dish" },
      { key: "indonesia", name: "Anonymous Transactional Dataset (Indonesian F&B POS, 3 outlets)", citation: "Engel, Gaol, Kurniawan, Budiharto (2026). Mendeley Data, V2. doi:10.17632/kcgf45y24m.2", url: "https://data.mendeley.com/datasets/kcgf45y24m/2", license: "CC BY 4.0", used: "Items per order, food vs drink mix, hour-of-day curve, drinks' daily swings" },
      { key: "dosm", name: "Services statistics by subsector — Food & Beverage (56)", citation: "Department of Statistics Malaysia via data.gov.my", url: "https://data.gov.my/data-catalogue/services_subsector", license: "CC BY 4.0", used: "Shop size (revenue per worker per day) and growth trend" },
      { key: "imigresen", name: "Arrivals by state of entry — Singapore residents into Johor", citation: "Jabatan Imigresen Malaysia via data.gov.my", url: "https://data.gov.my/data-catalogue/arrivals_soe", license: "CC BY 4.0", used: "Seasonal index by month" },
      { key: "ktmb", name: "KTMB daily ridership — Shuttle Tebrau (JB ↔ Woodlands)", citation: "KTMB via data.gov.my", url: "https://data.gov.my/data-catalogue/ridership_ktmb_daily", license: "CC BY 4.0", used: "Daily cross-border crowd surges on the exact date" },
    ],
    yaz: yaz(),
    indonesia: indonesia(),
    malaysia: malaysia(),
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  const kb = Math.round(fs.statSync(OUT).size / 1024);
  console.log(`✓ Wrote ${path.relative(process.cwd(), OUT)} (${kb} KB)`);
  console.log(`  Yaz ${out.yaz.days} days · Indonesia ${out.indonesia.receipts} receipts · DOSM RM ${out.malaysia.fb.revenuePerEmployeeDay}/worker/day · KTMB ${Object.keys(out.malaysia.ktmb.wave).length} days`);
  console.log(`  Saturday ×${out.yaz.dow.TOTAL[5]} · Sunday ×${out.yaz.dow.TOTAL[6]} · basket ${JSON.stringify(out.indonesia.basket)} · mix ${JSON.stringify(out.indonesia.mix)}`);
  console.log(`  JB season by month: ${out.malaysia.arrivals.seasonByMonth.join(" ")}`);
}

main();
