// Server-side only (also used by the seed script and tests, hence no "server-only" import here).
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/lib/generated/prisma/client";

/**
 * Single PrismaClient per server process (reused across hot reloads in dev).
 * Uses the node-postgres driver adapter so it works through Supabase's
 * transaction pooler (DATABASE_URL, port 6543).
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and configure it.");
  }
  const adapter = new PrismaPg({
    connectionString,
    max: Number(process.env.DATABASE_POOL_MAX ?? 5),
  });
  return new PrismaClient({
    adapter,
    // Expected failures (e.g. idempotency-key conflicts) are handled in code; tests stay quiet.
    log: process.env.NODE_ENV === "test" ? [] : process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];
