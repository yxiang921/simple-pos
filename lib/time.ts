/** Business day boundaries in Malaysia time (UTC+8, no DST). */
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function startOfTodayMYT(now = new Date()): Date {
  const local = new Date(now.getTime() + MYT_OFFSET_MS);
  const midnightLocalUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnightLocalUtc - MYT_OFFSET_MS);
}

export const DEFAULT_TZ = "Asia/Kuala_Lumpur";

/** Local calendar date ("YYYY-MM-DD") of `at` in time zone `tz`. */
export function localDate(at: Date, tz: string = DEFAULT_TZ): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** Offset of `tz` from UTC at instant `at`, in ms (e.g. +8h for Asia/Kuala_Lumpur). */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/** UTC instant for local wall-clock time `HH:MM` on local date `date` in `tz`. */
export function zonedTimeToUtc(date: string, time: string, tz: string = DEFAULT_TZ): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return new Date(guess - tzOffsetMs(new Date(guess), tz));
}

/** [start, end) UTC instants covering local date `date` in `tz`. */
export function dayRangeUtc(date: string, tz: string = DEFAULT_TZ): { start: Date; end: Date } {
  const start = zonedTimeToUtc(date, "00:00", tz);
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
  return { start, end: zonedTimeToUtc(next, "00:00", tz) };
}

/** Value for a PostgreSQL DATE column (Prisma maps DATE to a UTC-midnight Date). */
export function dateColumn(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
