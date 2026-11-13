/** Business day boundaries in Malaysia time (UTC+8, no DST). */
const MYT_OFFSET_MS = 8 * 60 * 60 * 1000;

export function startOfTodayMYT(now = new Date()): Date {
  const local = new Date(now.getTime() + MYT_OFFSET_MS);
  const midnightLocalUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnightLocalUtc - MYT_OFFSET_MS);
}
