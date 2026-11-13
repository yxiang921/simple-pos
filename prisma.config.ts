import "dotenv/config";
import { defineConfig } from "prisma/config";
import { withSchemaParam } from "./lib/db-schema";

// Prisma CLI configuration (migrations, seeding, studio).
// Migrations use DIRECT_URL — Supabase's session pooler / direct connection (port 5432).
// The app runtime uses DATABASE_URL (pooled, port 6543) via lib/db.ts.
// Tables are created in DATABASE_SCHEMA (default "public"); it is appended as ?schema=… here.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: withSchemaParam(process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? ""),
  },
});
