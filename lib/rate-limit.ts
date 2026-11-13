import "server-only";
import { headers } from "next/headers";

/**
 * Simple in-memory sliding-window rate limiter.
 * Effective per server instance. For multi-instance / serverless deployments,
 * swap the store for Redis/Upstash behind the same interface.
 */
const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

export function rateLimit(key: string, max: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, hits] of buckets) if (!hits.length || hits[hits.length - 1] < now - windowMs) buckets.delete(k);
    lastSweep = now;
  }
  const hits = (buckets.get(key) ?? []).filter((t) => t > now - windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.ceil((hits[0] + windowMs - now) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterSec: 0 };
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}
