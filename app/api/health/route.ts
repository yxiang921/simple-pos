import { prisma } from "@/lib/db";
import { dbSchema } from "@/lib/db-schema";

export const dynamic = "force-dynamic";

/** Newest migration this build expects. Keep in sync with prisma/migrations. */
const LATEST_MIGRATION = "20261117000000_stock_in";

/**
 * GET /api/health — deployment check. Reports which part of the setup is
 * missing (env vars, database connection, schema, migrations) without
 * revealing secrets, host names or data.
 */
export async function GET() {
  const checks: Record<string, unknown> = {};
  const fail = (step: string, hint: string) => Response.json({ ok: false, failed: step, hint, checks }, { status: 503 });

  const url = process.env.DATABASE_URL;
  checks.databaseUrlSet = Boolean(url);
  checks.schema = dbSchema();
  checks.sessionSecretOk = (process.env.SESSION_SECRET ?? "").length >= 32;
  if (url) {
    try {
      const u = new URL(url);
      checks.databasePort = u.port || "5432";
      checks.pgbouncerFlag = u.searchParams.get("pgbouncer") === "true";
    } catch {
      return fail("DATABASE_URL", "DATABASE_URL is not a valid postgresql:// URL.");
    }
  } else {
    return fail("DATABASE_URL", "Set DATABASE_URL in the hosting environment (Vercel → Settings → Environment Variables) and redeploy.");
  }
  if (!checks.sessionSecretOk) return fail("SESSION_SECRET", "Set SESSION_SECRET (32+ random characters) and redeploy.");

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.connected = true;
  } catch (e) {
    const code = (e as { code?: string })?.code ?? (e instanceof Error ? e.name : "unknown");
    return fail("connect", `Can't connect to the database (${code}). Check DATABASE_URL (Supabase transaction pooler, port 6543, ?pgbouncer=true) and that the project isn't paused.`);
  }

  const schema = dbSchema();
  const [row] = await prisma.$queryRaw<{ merchants: string | null; migrations: string | null; orders: string | null }[]>`
    SELECT to_regclass(${`"${schema}"."merchants"`})::text AS merchants,
           to_regclass(${`"${schema}"."_prisma_migrations"`})::text AS migrations,
           to_regclass(${`"${schema}"."orders"`})::text AS orders`;
  checks.posTables = Boolean(row?.orders);
  checks.merchantsTable = Boolean(row?.merchants);
  if (!row?.orders) {
    return fail("schema", `No POS tables in schema "${schema}". Set DATABASE_SCHEMA to the schema that holds them (e.g. "pos") and redeploy, or run \`npm run db:deploy\`.`);
  }
  if (row.migrations) {
    const applied = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM "${schema}"."_prisma_migrations" WHERE migration_name = $1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL`,
      LATEST_MIGRATION,
    );
    checks.latestMigrationApplied = Number(applied[0]?.n ?? 0) > 0;
  }
  if (!row.merchants || checks.latestMigrationApplied === false) {
    return fail("migrations", `The database is behind this version (missing ${LATEST_MIGRATION}). Run \`npm run db:deploy\` against it.`);
  }

  const merchants = await prisma.merchant.count();
  checks.merchants = merchants;
  return Response.json({ ok: true, checks, hint: merchants ? undefined : "No merchants yet: run `npm run db:seed` or register at /register." });
}
