import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { dateColumn, dayRangeUtc, DEFAULT_TZ } from "@/lib/time";

export type PrepRow = {
  menuItemId: string;
  name: string;
  category: string;
  isPreparedAhead: boolean | null;
  isAvailable: boolean;
  platesPrepared: number | null;
  sold: number;
  soldOutAt: string | null;
};

async function storeTimezone() {
  const s = await prisma.storeSetting.findUnique({ where: { id: 1 }, select: { timezone: true } });
  return s?.timezone || DEFAULT_TZ;
}

/** Prep sheet for one local business date: what was prepared vs sold, and when it sold out. */
export async function getPrepSheet(date: string): Promise<{ timezone: string; rows: PrepRow[] }> {
  const timezone = await storeTimezone();
  const { start, end } = dayRangeUtc(date, timezone);

  const [items, preps, sold, soldOuts] = await Promise.all([
    prisma.menuItem.findMany({
      where: { isArchived: false },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, isPreparedAhead: true, isAvailable: true, category: { select: { name: true } } },
    }),
    prisma.dailyPrep.findMany({ where: { date: dateColumn(date) } }),
    prisma.orderItem.groupBy({
      by: ["menuItemId"],
      where: { order: { createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } } },
      _sum: { quantity: true },
    }),
    prisma.soldOutEvent.findMany({
      where: { soldOutAt: { gte: start, lt: end } },
      orderBy: { soldOutAt: "asc" },
    }),
  ]);

  const prepBy = new Map(preps.map((p) => [p.menuItemId, p.platesPrepared]));
  const soldBy = new Map(sold.map((s) => [s.menuItemId, s._sum.quantity ?? 0]));
  const soldOutBy = new Map<string, Date>();
  for (const e of soldOuts) if (!soldOutBy.has(e.menuItemId)) soldOutBy.set(e.menuItemId, e.soldOutAt);

  const rows: PrepRow[] = items.map((m) => ({
    menuItemId: m.id,
    name: m.name,
    category: m.category.name,
    isPreparedAhead: m.isPreparedAhead,
    isAvailable: m.isAvailable,
    platesPrepared: prepBy.get(m.id) ?? null,
    sold: soldBy.get(m.id) ?? 0,
    soldOutAt: soldOutBy.get(m.id)?.toISOString() ?? null,
  }));
  // Prepared-ahead items first, then not set, then made-to-order.
  const rank = (v: boolean | null) => (v === true ? 0 : v === null ? 1 : 2);
  rows.sort((a, b) => rank(a.isPreparedAhead) - rank(b.isPreparedAhead));
  return { timezone, rows };
}

/**
 * Save the prep sheet for a date. A number upserts the row; null removes it
 * (unknown is stored as "no row", never as a guessed number).
 */
export async function savePrep(date: string, entries: { menuItemId: string; plates: number | null }[]) {
  const day = dateColumn(date);
  const ids = entries.map((e) => e.menuItemId);
  const found = await prisma.menuItem.count({ where: { id: { in: ids } } });
  if (found !== new Set(ids).size) throw new DomainError("Some menu items no longer exist. Refresh and try again.");

  return prisma.$transaction(async (tx) => {
    let saved = 0;
    for (const e of entries) {
      if (e.plates === null) {
        await tx.dailyPrep.deleteMany({ where: { date: day, menuItemId: e.menuItemId } });
      } else {
        await tx.dailyPrep.upsert({
          where: { date_menuItemId: { date: day, menuItemId: e.menuItemId } },
          create: { date: day, menuItemId: e.menuItemId, platesPrepared: e.plates },
          update: { platesPrepared: e.plates, isSimulated: false },
        });
        saved++;
      }
    }
    return { saved };
  });
}
