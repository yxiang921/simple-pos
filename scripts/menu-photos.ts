/**
 * Add photos to the sample menu items (all merchants, or one).
 *
 *   npm run demo:photos                       # items without a photo get one
 *   npm run demo:photos -- --merchant=kopi-co
 *   npm run demo:photos -- --replace          # also replace existing photos of those items
 *
 * Photos come from Wikimedia Commons (free licences; credits are shown in the
 * guest menu and on Admin → Data sources). Items are matched by name.
 */
import "dotenv/config";
import { prisma } from "../lib/db";
import { dbSchema } from "../lib/db-schema";
import { MENU_PHOTOS } from "../lib/menu-photos";
import { fillMenuPhotos } from "./lib/photos";
import { requireCurrentClient } from "./lib/client-check";

async function main() {
  requireCurrentClient();
  const slug = process.argv.find((a) => a.startsWith("--merchant="))?.slice(11);
  const replace = process.argv.includes("--replace");
  let merchantId: string | undefined;
  if (slug) {
    const m = await prisma.merchant.findUnique({ where: { slug }, select: { id: true } });
    if (!m) throw new Error(`Unknown merchant "${slug}".`);
    merchantId = m.id;
  }
  console.log(`Schema: ${dbSchema()}${slug ? ` · merchant ${slug}` : " · all merchants"}`);
  const n = await fillMenuPhotos({ merchantId, replace });
  console.log(`✓ ${n} menu item(s) got a photo (${Object.keys(MENU_PHOTOS).length} dishes known${replace ? ", existing photos replaced" : ", existing photos kept"}).`);
}

main()
  .catch((e) => {
    console.error("✗", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
