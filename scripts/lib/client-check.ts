import fs from "node:fs";
import path from "node:path";

/**
 * The generated Prisma client embeds a copy of the schema it was generated
 * from. If prisma/schema.prisma has changed since (new columns/tables), every
 * query touching them fails with "Unknown field …". Detect that up front.
 *
 * Returns true/false, or null when it can't tell (never blocks in that case).
 */
export function generatedClientIsCurrent(root = process.cwd()): boolean | null {
  const clientFile = path.join(root, "lib", "generated", "prisma", "internal", "class.ts");
  const schemaFile = path.join(root, "prisma", "schema.prisma");
  if (!fs.existsSync(schemaFile)) return null;
  if (!fs.existsSync(clientFile)) return false;
  const m = fs.readFileSync(clientFile, "utf8").match(/"inlineSchema":\s*("(?:[^"\\]|\\.)*")/);
  if (!m) return null;
  // Prisma re-formats the schema before embedding it, so compare ignoring spacing.
  const norm = (s: string) =>
    s
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
  return norm(JSON.parse(m[1]) as string) === norm(fs.readFileSync(schemaFile, "utf8"));
}

/** Exit with a clear message if the generated client is older than the schema. */
export function requireCurrentClient() {
  if (generatedClientIsCurrent() === false) {
    console.error(
      "✗ The generated Prisma client is out of date — prisma/schema.prisma has changed since it was generated.\n" +
        "  Run:  npx prisma generate\n" +
        "  Then restart `npm run dev` if it is running, and run this command again.",
    );
    process.exit(1);
  }
}
