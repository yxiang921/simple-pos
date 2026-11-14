// Server-side only (also used by the seed script and tests, hence no "server-only" import here).
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { dbSchema } from "@/lib/db-schema";

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
  const adapter = new PrismaPg(
    { connectionString, max: Number(process.env.DATABASE_POOL_MAX ?? 5) },
    { schema: dbSchema() },
  );
  return new PrismaClient({
    adapter,
    // Interactive transactions: generous limits for hosted setups where each
    // query is a network round trip (e.g. Vercel → Supabase in another region).
    // Hot paths are batched into a handful of statements regardless.
    transactionOptions: { maxWait: 10_000, timeout: 30_000 },
    // Expected failures (e.g. idempotency-key conflicts) are handled in code; tests stay quiet.
    log: process.env.NODE_ENV === "test" ? [] : process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Schema-qualified table name for raw SQL, e.g. sql`SELECT … FROM ${table("orders")}`.
 * Raw queries must use this so they hit DATABASE_SCHEMA rather than the
 * connection's default search_path (which is "public" on Supabase).
 */
export function table(name: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error(`Invalid table name: ${name}`);
  return Prisma.raw(`"${dbSchema()}"."${name}"`);
}
