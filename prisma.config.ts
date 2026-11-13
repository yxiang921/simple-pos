import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI configuration (migrations, seeding, studio).
// Migrations use DIRECT_URL — Supabase's direct / session connection (port 5432).
// The app runtime uses DATABASE_URL (pooled, port 6543) via lib/db.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
  },
});
