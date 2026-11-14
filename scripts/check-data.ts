/**
 * Data check for the POS database (schema DATABASE_SCHEMA), plus an optional
 * dummy-data fill for everything that is still empty.
 *
 *   npm run db:check                       # read-only: SELECTs only, shows what is empty
 *   npm run db:fill                        # check → fill empties with dummy data → check again
 *   npm run db:fill -- --days=90           # history window (default 365 days)
 *   npm run db:fill -- --undo=latest       # revert the last fill (or --undo=reports/<file>.json)
 *   npm run db:check -- --merchant=<slug>  # which merchant (default: the first one)
 *
 * Merchant-level data (settings, menu, ingredients, floor plan, running costs)
 * is checked once; order history per branch.
 *
 * Fill never overwrites existing values. It writes a change log to
 * reports/db-fill-<timestamp>.json which --undo uses. Only tables in the POS
 * schema are touched; other schemas (e.g. another app in "public") are not.
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { Prisma } from "../lib/generated/prisma/client";
import { prisma, table } from "../lib/db";
import { dbSchema } from "../lib/db-schema";
import { dayRangeUtc, localDate } from "../lib/time";
import { formatRM } from "../lib/format";
import { EXPENSE_CATEGORY_SHORT } from "../lib/expense-labels";
import { monthlyEquivalent } from "../lib/services/expenses";
import { DEMO_EXPENSES } from "./demo-catalog";
import {
  dummyPreparedAhead,
  fillEmptyFields,
  historyCoverage,
  REAL_DAY_MIN_ORDERS,
  removeSimulated,
  simulateDays,
  resolveTarget,
  storeInfo,
  type FieldChange,
} from "./lib/demo";
import { requireCurrentClient } from "./lib/client-check";
import { createSampleLayout } from "../lib/services/floor";
import { branchScale } from "./lib/demo-tenants";

const D = Prisma.Decimal;
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : "true"] as const;
  }),
);
const DAYS = Math.min(730, Math.max(7, Number(args.get("days") ?? 365)));
const MODE: "check" | "fill" | "undo" = args.has("undo") ? "undo" : args.has("fill") ? "fill" : "check";
const REPORT_DIR = path.join(process.cwd(), "reports");

type Target = Awaited<ReturnType<typeof resolveTarget>>;
let T: Target;
const scaleOf = (b: { slug: string; isHeadquarters: boolean }) => branchScale(b);

// ─── output ────────────────────────────────────────────────────────────

type Status = "OK" | "EMPTY" | "WARN" | "INFO" | "ERROR";
type Row = { status: Status; label: string; detail: string; fix?: string };

function printRows(title: string, rows: Row[]) {
  console.log(`\n${title}`);
  console.log("─".repeat(Math.max(60, title.length)));
  for (const r of rows) {
    console.log(`${`[${r.status}]`.padEnd(8)} ${r.label.padEnd(22)} ${r.detail}`);
    if (r.fix) console.log(`${" ".repeat(32)}→ ${r.fix}`);
  }
}

const list = (names: string[], max = 4) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} +${names.length - max} more`;

function dbTarget() {
  try {
    const u = new URL(process.env.DATABASE_URL ?? "");
    return `${u.hostname}:${u.port || 5432}`;
  } catch {
    return "(DATABASE_URL not set)";
  }
}

// ─── checks ────────────────────────────────────────────────────────────

async function migrationStatus() {
  const dir = path.join(process.cwd(), "prisma", "migrations");
  const expected = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  const [{ reg }] = await prisma.$queryRaw<{ reg: string | null }[]>`
    SELECT to_regclass(${`"${dbSchema()}"."_prisma_migrations"`})::text AS reg`;
  if (!reg) return { expected, missing: expected, failed: [] as string[] };
  const rows = await prisma.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
    SELECT migration_name, finished_at, rolled_back_at FROM ${table("_prisma_migrations")}`;
  const applied = new Set(rows.filter((r) => r.finished_at && !r.rolled_back_at).map((r) => r.migration_name));
  return {
    expected,
    missing: expected.filter((m) => !applied.has(m)),
    failed: rows.filter((r) => !r.finished_at && !r.rolled_back_at).map((r) => r.migration_name),
  };
}

async function runChecks(): Promise<{ rows: Row[]; blocking: boolean; canSimulate: boolean; fillable: number }> {
  const rows: Row[] = [];
  const schema = dbSchema();
  rows.push({ status: "INFO", label: "Database", detail: `${dbTarget()} · schema "${schema}"` });

  // Migrations first — everything else needs the tables.
  const mig = await migrationStatus();
  if (mig.failed.length) {
    rows.push({ status: "ERROR", label: "Migrations", detail: `failed: ${mig.failed.join(", ")}`, fix: "see `npx prisma migrate status`" });
    return { rows, blocking: true, canSimulate: false, fillable: 0 };
  }
  if (mig.missing.length) {
    rows.push({
      status: "ERROR",
      label: "Migrations",
      detail: `${mig.expected.length - mig.missing.length}/${mig.expected.length} applied, missing: ${mig.missing.join(", ")}`,
      fix: "run `npm run db:deploy`, then `npx prisma generate`, then check again",
    });
    return { rows, blocking: true, canSimulate: false, fillable: 0 };
  }
  rows.push({ status: "OK", label: "Migrations", detail: `${mig.expected.length}/${mig.expected.length} applied` });

  let fillable = 0;
  const merchantId = T.merchant.id;
  rows.push({ status: "INFO", label: "Merchant", detail: `${T.merchant.name} (${T.merchant.slug}) · ${T.branches.length} branch(es): ${T.branches.map((b) => b.name).join(", ")}` });
  if (T.multipleMerchants) rows.push({ status: "INFO", label: "Other merchants", detail: `${T.merchants.slice(1).map((m) => m.slug).join(", ")} — check them with --merchant=<slug>` });
  const store = await storeInfo(merchantId);
  if (!store.exists) {
    fillable++;
    rows.push({ status: "EMPTY", label: "Store settings", detail: "no settings row", fix: "create with hours 07:00–21:00, Asia/Kuala_Lumpur" });
  } else if (!store.openTime || !store.closeTime) {
    fillable++;
    rows.push({
      status: "EMPTY",
      label: "Store hours",
      detail: `${store.name} · open ${store.openTime ?? "—"} · close ${store.closeTime ?? "—"} · ${store.tz}`,
      fix: "set missing open/close time to 07:00 / 21:00",
    });
  } else {
    rows.push({ status: "OK", label: "Store settings", detail: `${store.name} · ${store.openTime}–${store.closeTime} · ${store.tz}` });
  }

  const admins = await prisma.adminUser.count({ where: { merchantId } });
  rows.push(
    admins
      ? { status: "OK", label: "Admin accounts", detail: String(admins) }
      : { status: "WARN", label: "Admin accounts", detail: "none", fix: "run `npm run admin:password` (not filled automatically)" },
  );

  const [cats, activeCats] = await Promise.all([
    prisma.category.count({ where: { merchantId } }),
    prisma.category.count({ where: { merchantId, isActive: true } }),
  ]);
  const items = await prisma.menuItem.findMany({
    where: { merchantId, isArchived: false },
    select: {
      id: true,
      name: true,
      isAvailable: true,
      isPreparedAhead: true,
      aliases: true,
      category: { select: { name: true } },
      _count: { select: { recipe: true } },
    },
    orderBy: { name: "asc" },
  });
  const archived = await prisma.menuItem.count({ where: { merchantId, isArchived: true } });
  if (!cats || !items.length) {
    rows.push({
      status: "WARN",
      label: "Menu",
      detail: `${cats} categories, ${items.length} menu items`,
      fix: "run `npm run db:seed` for the demo menu (order history can't be simulated without a menu)",
    });
  } else {
    const hidden = items.filter((i) => !i.isAvailable).length;
    rows.push({
      status: "OK",
      label: "Menu",
      detail: `${activeCats}/${cats} categories visible · ${items.length - hidden} items on menu, ${hidden} hidden, ${archived} archived`,
    });
  }

  const noRecipe = items.filter((i) => i._count.recipe === 0);
  if (items.length) {
    rows.push(
      noRecipe.length
        ? {
            status: "WARN",
            label: "Recipes",
            detail: `${noRecipe.length} item(s) without a recipe: ${list(noRecipe.map((i) => i.name))}`,
            fix: "not filled automatically — a made-up recipe would deduct the wrong stock. Add it in Menu → Edit",
          }
        : { status: "OK", label: "Recipes", detail: `all ${items.length} items have a recipe` },
    );
  }

  const flagNull = items.filter((i) => i.isPreparedAhead === null);
  if (flagNull.length) {
    fillable++;
    const ahead = flagNull.filter((i) => dummyPreparedAhead(i.name, i.category.name));
    rows.push({
      status: "EMPTY",
      label: "Prepared ahead",
      detail: `${flagNull.length} item(s) not set`,
      fix: `set by name: ${ahead.length} prepared ahead${ahead.length ? ` (${list(ahead.map((i) => i.name), 3)})` : ""}, ${flagNull.length - ahead.length} made to order`,
    });
  } else if (items.length) {
    rows.push({ status: "OK", label: "Prepared ahead", detail: `${items.filter((i) => i.isPreparedAhead).length} prepared ahead, ${items.filter((i) => i.isPreparedAhead === false).length} made to order` });
  }

  const noAlias = items.filter((i) => i.aliases.length === 0);
  if (noAlias.length) {
    fillable++;
    rows.push({ status: "EMPTY", label: "Aliases", detail: `${noAlias.length} item(s) without aliases`, fix: "generate from the item name (demo list for seeded items)" });
  } else if (items.length) {
    rows.push({ status: "OK", label: "Aliases", detail: `all ${items.length} items have aliases` });
  }

  const ingredients = await prisma.ingredient.findMany({
    where: { merchantId },
    select: { name: true, isActive: true, costPerUnit: true },
    orderBy: { name: "asc" },
  });
  const noCost = ingredients.filter((i) => i.costPerUnit === null);
  if (!ingredients.length) {
    rows.push({ status: "WARN", label: "Ingredients", detail: "none", fix: "run `npm run db:seed` or add ingredients in Inventory" });
  } else if (noCost.length) {
    fillable++;
    rows.push({
      status: "EMPTY",
      label: "Ingredient cost",
      detail: `${noCost.length}/${ingredients.length} without cost: ${list(noCost.map((i) => i.name))}`,
      fix: "dummy RM per kg / L / pcs (demo list by SKU, else guessed from the name, else unit default)",
    });
  } else {
    rows.push({ status: "OK", label: "Ingredient cost", detail: `all ${ingredients.length} ingredients have a cost` });
  }
  // Stock is kept per branch.
  for (const b of T.branches) {
    const stocks = await prisma.ingredientStock.findMany({
      where: { branchId: b.id, ingredient: { isActive: true } },
      select: { currentStock: true, lowStockThreshold: true },
    });
    if (!ingredients.length) break;
    const zeroThreshold = stocks.filter((x) => x.lowStockThreshold.lte(0)).length;
    const low = stocks.filter((x) => x.currentStock.gt(0) && x.currentStock.lte(x.lowStockThreshold)).length;
    const out = stocks.filter((x) => x.currentStock.lte(0)).length;
    const missingRows = ingredients.filter((i) => i.isActive).length - stocks.length;
    rows.push({
      status: "INFO",
      label: `Stock · ${b.slug}`,
      detail: `${low} low, ${out} out of stock${missingRows > 0 ? ` · ${missingRows} never stocked here` : ""}${zeroThreshold ? ` · ${zeroThreshold} with low-stock threshold 0 (never warns; not changed)` : ""}`,
    });
  }

  // Order history over the window, per branch.
  const canSimulate = items.length > 0;
  let cov = await historyCoverage(DAYS, store.tz, T.branches[0].id);
  let anyNeeding = false;
  for (const b of T.branches) {
    const c = await historyCoverage(DAYS, store.tz, b.id);
    if (b === T.branches[0]) cov = c;
    const [realOrders, simOrders] = await Promise.all([
      prisma.order.count({ where: { branchId: b.id, isSimulated: false } }),
      prisma.order.count({ where: { branchId: b.id, isSimulated: true } }),
    ]);
    const histDetail = `${c.withData}/${DAYS} days with history (${c.first} → ${c.last}) · ${realOrders} real, ${simOrders} simulated orders in total`;
    if (c.needing.length) {
      anyNeeding = true;
      fillable++;
      rows.push({
        status: "EMPTY",
        label: `History · ${b.slug}`,
        detail: histDetail,
        fix: canSimulate
          ? `simulate ${c.needing.length} day(s) at size ×${scaleOf(b)} (days with simulated data or ≥ ${REAL_DAY_MIN_ORDERS} real orders are left alone)`
          : "add a menu first",
      });
    } else {
      rows.push({ status: "OK", label: `History · ${b.slug}`, detail: `${histDetail} · each weekday ≥ ${c.minPerWeekday}×` });
    }
  }

  // Daily prep for prepared-ahead items.
  const aheadIds = items.filter((i) => i.isPreparedAhead).map((i) => i.id);
  const [prepInWindow, prepToday] = await Promise.all([
    prisma.dailyPrep.count({ where: { branch: { merchantId }, date: { gte: new Date(`${cov.first}T00:00:00Z`), lt: new Date(`${cov.today}T00:00:00Z`) } } }),
    prisma.dailyPrep.count({ where: { branch: { merchantId }, date: new Date(`${cov.today}T00:00:00Z`) } }),
  ]);
  if (!aheadIds.length && !flagNull.length) {
    rows.push({ status: "INFO", label: "Daily prep", detail: "no prepared-ahead items, so no prep rows expected" });
  } else {
    const expected = aheadIds.length * DAYS * T.branches.length;
    const full = aheadIds.length > 0 && prepInWindow >= expected;
    rows.push({
      status: full ? "OK" : anyNeeding ? "EMPTY" : "INFO",
      label: "Daily prep",
      detail: `${prepInWindow} row(s) in window${aheadIds.length ? ` (${aheadIds.length} prepared-ahead items × ${DAYS} days × ${T.branches.length} branch(es) = ${expected})` : ""} · today: ${prepToday}`,
      fix: full
        ? undefined
        : anyNeeding
          ? "filled for every simulated day; today's prep is left for staff to enter"
          : "days with real orders but no prep are left empty (unknown); today's prep is entered by staff",
    });
  }

  const soldOuts = await prisma.soldOutEvent.count({
    where: { branch: { merchantId }, soldOutAt: { gte: dayRangeUtc(cov.first, store.tz).start, lt: dayRangeUtc(cov.today, store.tz).start } },
  });
  rows.push({ status: "INFO", label: "Sold-out events", detail: `${soldOuts} in window (recorded when items are switched off; simulated days include them)` });

  // Floor plan for the 3D floor view.
  const floorObjects = await prisma.floorObject.findMany({ where: { merchantId }, select: { kind: true } });
  if (floorObjects.length === 0) {
    fillable++;
    rows.push({ status: "EMPTY", label: "Floor plan", detail: "no floor plan", fix: "add the sample café layout (12 tables, counter, kitchen, pickup point)" });
  } else {
    const tables = floorObjects.filter((o) => o.kind === "TABLE").length;
    rows.push({ status: "OK", label: "Floor plan", detail: `${floorObjects.length} objects, ${tables} tables` });
  }

  // Running costs.
  const expenses = await prisma.expense.findMany({ where: { merchantId } });
  const cats2 = new Set(expenses.map((e) => e.category));
  const missingCats = [...new Set(DEMO_EXPENSES.map((e) => e.category))].filter((c) => !cats2.has(c));
  const today = localDate(new Date(), store.tz);
  const activeMonthly = expenses
    .filter((e) => {
      const s = e.startDate.toISOString().slice(0, 10);
      const end = e.endDate?.toISOString().slice(0, 10);
      return s <= today && (!end || end >= today);
    })
    .reduce((sum, e) => sum.add(monthlyEquivalent(e.amount, e.frequency) ?? new D(0)), new D(0));
  const expDetail = `${expenses.length} entr${expenses.length === 1 ? "y" : "ies"} · ${formatRM(activeMonthly.toFixed(2))}/month active · ${expenses.filter((e) => e.isSimulated).length} dummy`;
  if (missingCats.length) {
    fillable++;
    rows.push({
      status: "EMPTY",
      label: "Running costs",
      detail: `${expDetail} · no ${list(missingCats.map((c) => EXPENSE_CATEGORY_SHORT[c]), 6)}`,
      fix: `add ${DEMO_EXPENSES.filter((e) => missingCats.includes(e.category)).length} dummy cost(s) for those categories`,
    });
  } else {
    rows.push({ status: "OK", label: "Running costs", detail: expDetail });
  }

  return { rows, blocking: false, canSimulate, fillable: Math.max(fillable, rows.filter((r) => r.status === "EMPTY").length) };
}

// ─── fill & undo ───────────────────────────────────────────────────────

function describeChange(c: FieldChange) {
  const v = Array.isArray(c.after) ? `{${c.after.join(", ")}}` : String(c.after);
  return `${c.label}: ${c.field} = ${c.note ?? v}`;
}

async function fill() {
  const before = await runChecks();
  printRows(`POS data check — before fill (${DAYS}-day window)`, before.rows);
  if (before.blocking) {
    console.log("\n✗ Fix the errors above first. Nothing was changed.");
    process.exitCode = 1;
    return;
  }
  if (before.fillable === 0) {
    console.log("\n✓ Nothing is empty. Nothing was changed.");
    return;
  }

  console.log("\nFilling empty data with dummy values…");
  const merchantId = T.merchant.id;
  const f = await fillEmptyFields({ windowDays: DAYS, merchantId });
  const { tz } = await storeInfo(merchantId);
  let floorPlan: { ids: string[]; at: string } | null = null;
  if ((await prisma.floorObject.count({ where: { merchantId } })) === 0) {
    await createSampleLayout(merchantId);
    floorPlan = { ids: (await prisma.floorObject.findMany({ where: { merchantId }, select: { id: true } })).map((o) => o.id), at: new Date().toISOString() };
  }
  const simulated: { branchId: string; slug: string; days: string[]; orders: number; plates: number; prepRows: number; soldOuts: number }[] = [];
  if (before.canSimulate) {
    for (const b of T.branches) {
      const cov = await historyCoverage(DAYS, tz, b.id);
      if (!cov.needing.length) continue;
      console.log(`• ${b.name}: simulating ${cov.needing.length} day(s) of history…`);
      const r = await simulateDays(cov.needing, { branchId: b.id, windowDays: DAYS, scale: scaleOf(b) });
      simulated.push({ branchId: b.id, slug: b.slug, days: r.days, orders: r.orders, plates: r.plates, prepRows: r.prepRows, soldOuts: r.soldOuts });
    }
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
  const file = path.join(REPORT_DIR, `db-fill-${stamp}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        version: 2,
        createdAt: new Date().toISOString(),
        schema: dbSchema(),
        merchantId,
        merchantSlug: T.merchant.slug,
        timezone: tz,
        windowDays: DAYS,
        fields: f.fields,
        createdStoreSettings: f.createdStoreSettings,
        insertedExpenseIds: f.insertedExpenseIds,
        insertedExpenseCategories: f.insertedExpenseCategories,
        floorPlan,
        simulated,
      },
      null,
      2,
    ),
  );

  console.log("\nChanges (dummy values):");
  const byField = (field: FieldChange["field"]) => f.fields.filter((c) => c.field === field);
  for (const [field, label] of [
    ["costPerUnit", "Ingredient costs"],
    ["isPreparedAhead", "Prepared-ahead flags"],
    ["aliases", "Aliases"],
    ["openTime", "Store hours"],
  ] as const) {
    const cs = field === "openTime" ? f.fields.filter((c) => c.table === "store_settings") : byField(field);
    if (!cs.length) continue;
    console.log(`  • ${label}: ${cs.length}`);
    for (const c of cs.slice(0, 8)) console.log(`      ${describeChange(c)}`);
    if (cs.length > 8) console.log(`      … +${cs.length - 8} more (see report)`);
  }
  if (f.insertedExpenseIds.length) {
    console.log(`  • Running costs: ${f.insertedExpenseIds.length} for ${f.insertedExpenseCategories.map((c) => EXPENSE_CATEGORY_SHORT[c]).join(", ")}`);
  }
  if (floorPlan) console.log(`  • Floor plan: sample café layout (${floorPlan.ids.length} objects)`);
  for (const sm of simulated) {
    console.log(
      `  • History · ${sm.slug}: ${sm.days.length} day(s), ${sm.orders} orders, ${sm.plates} plates, ` +
        `${sm.prepRows} prep rows, ${sm.soldOuts} sold-out events (stock not changed)`,
    );
  }

  const after = await runChecks();
  printRows("POS data check — after fill", after.rows);
  console.log(`\n✓ Done. Change log: ${path.relative(process.cwd(), file)}`);
  console.log(`  Undo with: npm run db:fill -- --undo=${path.relative(process.cwd(), file).replace(/\\/g, "/")}`);
}

function latestReport() {
  if (!fs.existsSync(REPORT_DIR)) return null;
  const files = fs.readdirSync(REPORT_DIR).filter((f) => /^db-fill-.*\.json$/.test(f)).sort();
  return files.length ? path.join(REPORT_DIR, files[files.length - 1]) : null;
}

async function undo() {
  const arg = args.get("undo");
  const file = !arg || arg === "true" || arg === "latest" ? latestReport() : path.resolve(arg);
  if (!file || !fs.existsSync(file)) throw new Error("No fill report found. Pass --undo=reports/db-fill-<timestamp>.json");
  const rep = JSON.parse(fs.readFileSync(file, "utf8"));
  if (rep.schema !== dbSchema()) throw new Error(`Report is for schema "${rep.schema}", but DATABASE_SCHEMA is "${dbSchema()}".`);
  if (rep.version !== 2 || !rep.merchantId) throw new Error("This report was made before multi-merchant support and can't be undone automatically.");
  const merchantId: string = rep.merchantId;
  if (rep.undoneAt) console.log(`! This report was already undone at ${rep.undoneAt}; running again is harmless.`);
  console.log(`Undoing ${path.relative(process.cwd(), file)} (created ${rep.createdAt})…`);

  let reverted = 0;
  const kept: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  for (const c of rep.fields as FieldChange[]) {
    if (c.table === "ingredients") {
      const cur = await prisma.ingredient.findUnique({ where: { id: c.id }, select: { costPerUnit: true } });
      if (cur?.costPerUnit && cur.costPerUnit.equals(new D(c.after as string))) {
        await prisma.ingredient.update({ where: { id: c.id }, data: { costPerUnit: null } });
        reverted++;
      } else if (cur?.costPerUnit) kept.push(`${c.label} cost`); // null = already reverted
    } else if (c.table === "menu_items") {
      const cur = await prisma.menuItem.findUnique({ where: { id: c.id }, select: { isPreparedAhead: true, aliases: true } });
      if (!cur) continue;
      if (c.field === "isPreparedAhead" && cur.isPreparedAhead === c.after) {
        await prisma.menuItem.update({ where: { id: c.id }, data: { isPreparedAhead: null } });
        reverted++;
      } else if (c.field === "aliases" && same(cur.aliases, c.after)) {
        await prisma.menuItem.update({ where: { id: c.id }, data: { aliases: [] } });
        reverted++;
      } else if (!same(c.field === "aliases" ? cur.aliases : cur.isPreparedAhead, c.before)) kept.push(`${c.label} ${c.field}`);
    } else if (c.table === "store_settings" && (c.field === "openTime" || c.field === "closeTime")) {
      const cur = await prisma.storeSetting.findUnique({ where: { merchantId } });
      if (cur && cur[c.field] === c.after) {
        await prisma.storeSetting.update({ where: { merchantId }, data: { [c.field]: null } });
        reverted++;
      } else if (cur && cur[c.field] !== c.before) kept.push(`store ${c.field}`);
    }
  }
  // Dummy running costs that were edited in the app are no longer flagged simulated, so they are kept.
  const ex = await prisma.expense.deleteMany({ where: { id: { in: rep.insertedExpenseIds ?? [] }, isSimulated: true } });
  // The sample floor plan is removed only if nobody has saved a layout since.
  let floorRemoved = false;
  if (rep.floorPlan) {
    const current = await prisma.floorObject.findMany({ where: { merchantId }, select: { id: true, updatedAt: true } });
    const ids = new Set<string>(rep.floorPlan.ids);
    const untouched =
      current.length === ids.size &&
      current.every((o) => ids.has(o.id) && o.updatedAt.getTime() <= Date.parse(rep.floorPlan.at) + 5000);
    if (untouched) {
      await prisma.floorObject.deleteMany({ where: { merchantId } });
      floorRemoved = true;
    } else kept.push("floor plan (edited since)");
  }
  const sim = { orders: 0, prep: 0, soldOuts: 0 };
  for (const sm of (rep.simulated ?? []) as { branchId: string; days: string[] }[]) {
    const r = await removeSimulated({ merchantId, branchId: sm.branchId, days: sm.days });
    sim.orders += r.orders;
    sim.prep += r.prep;
    sim.soldOuts += r.soldOuts;
  }

  rep.undoneAt = new Date().toISOString();
  fs.writeFileSync(file, JSON.stringify(rep, null, 2));
  console.log(
    `✓ Reverted ${reverted} field(s), removed ${ex.count} dummy running cost(s)${floorRemoved ? ", the sample floor plan" : ""}, ` +
      `${sim.orders} simulated orders, ${sim.prep} prep rows, ${sim.soldOuts} sold-out events.`,
  );
  if (kept.length) console.log(`  Kept ${kept.length} value(s) changed since the fill: ${list(kept, 6)}`);
}

// ─── main ──────────────────────────────────────────────────────────────

async function main() {
  requireCurrentClient();
  if (MODE === "undo") return undo();
  T = await resolveTarget({ merchant: args.get("merchant") });
  if (MODE === "fill") return fill();
  const r = await runChecks();
  printRows(`POS data check (${DAYS}-day window) — read-only`, r.rows);
  if (r.blocking) {
    process.exitCode = 1;
  } else if (r.fillable) {
    console.log(`\n${r.fillable} area(s) are empty. Run \`npm run db:fill\` to fill them with dummy data (nothing is overwritten).`);
  } else {
    console.log("\n✓ Nothing is empty.");
  }
}

main()
  .catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/P1001|Can't reach|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|timeout/i.test(msg)) {
      console.error(`✗ Can't reach the database at ${dbTarget()}. Check your internet connection and that the Supabase project isn't paused.`);
    } else if (/P2021|does not exist/i.test(msg)) {
      console.error(`✗ A table is missing (${msg.split("\n").pop()}). Run \`npm run db:deploy\` and \`npx prisma generate\` first.`);
    } else {
      console.error("✗", msg);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
