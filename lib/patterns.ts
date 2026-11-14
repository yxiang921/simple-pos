import "server-only";
import fs from "node:fs";
import path from "node:path";

/** Summary of data/real-patterns.json for display (attribution, sources, key numbers). */
export type PatternSummary = {
  generatedAt: string;
  attribution: string;
  sources: { key: string; name: string; citation: string; url: string; license: string; used: string }[];
  yaz: { days: number; from: string; to: string; weekday: number[] };
  indonesia: { receipts: number; from: string; to: string; basket: Record<string, number>; mix: { main: number; snack: number; drink: number }; hourly: number[] };
  malaysia: { revenuePerEmployeeDay: number; latestQuarter: string; seasonByMonth: number[]; ktmbFrom: string; ktmbTo: string; ktmbDays: number };
};

let cache: PatternSummary | null | undefined;

export function patternSummary(): PatternSummary | null {
  if (cache !== undefined) return cache;
  try {
    const p = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "real-patterns.json"), "utf8"));
    cache = {
      generatedAt: p.generatedAt,
      attribution: p.attribution,
      sources: p.sources,
      yaz: { days: p.yaz.days, from: p.yaz.from, to: p.yaz.to, weekday: p.yaz.dow.TOTAL },
      indonesia: { receipts: p.indonesia.receipts, from: p.indonesia.from, to: p.indonesia.to, basket: p.indonesia.basket, mix: p.indonesia.mix, hourly: p.indonesia.hourly.weekday },
      malaysia: {
        revenuePerEmployeeDay: p.malaysia.fb.revenuePerEmployeeDay,
        latestQuarter: p.malaysia.fb.latestQuarter,
        seasonByMonth: p.malaysia.arrivals.seasonByMonth,
        ktmbFrom: p.malaysia.ktmb.from,
        ktmbTo: p.malaysia.ktmb.to,
        ktmbDays: Object.keys(p.malaysia.ktmb.wave).length,
      },
    };
  } catch {
    cache = null;
  }
  return cache;
}
