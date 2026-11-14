import "dotenv/config";

// Integration tests run against a real, disposable PostgreSQL database.
// They TRUNCATE every table, so never point TEST_DATABASE_URL at real data.
const url = process.env.TEST_DATABASE_URL;
if (!url) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Create an empty database, apply migrations to it " +
      "(DIRECT_URL=<test url> npx prisma migrate deploy) and set TEST_DATABASE_URL in .env.",
  );
}
if (url === process.env.DATABASE_URL || url === process.env.DIRECT_URL) {
  throw new Error("TEST_DATABASE_URL must point to a different database than DATABASE_URL / DIRECT_URL.");
}
process.env.DATABASE_URL = url;
process.env.REALTIME_DATABASE_URL = url;
process.env.DATABASE_POOL_MAX = "20";
