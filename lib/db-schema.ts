/**
 * PostgreSQL schema that holds the POS tables. Defaults to "public".
 * Set DATABASE_SCHEMA (e.g. "pos") to keep the POS separate from other apps
 * sharing the same database.
 */
export function dbSchema(): string {
  const schema = (process.env.DATABASE_SCHEMA ?? "public").trim() || "public";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) {
    throw new Error(`Invalid DATABASE_SCHEMA "${schema}". Use lowercase letters, digits and underscores.`);
  }
  return schema;
}

/** Returns `url` with `?schema=<DATABASE_SCHEMA>` set (used by the Prisma CLI for migrations). */
export function withSchemaParam(url: string): string {
  if (!url) return url;
  const u = new URL(url);
  u.searchParams.set("schema", dbSchema());
  return u.toString();
}
