import { prisma } from "../../lib/db";
import { MENU_PHOTOS, photoUrl } from "../../lib/menu-photos";

/**
 * Give menu items of the sample menu a photo (Wikimedia Commons, see
 * lib/menu-photos.ts). Matches by item name; only items WITHOUT an image are
 * changed unless `replace` is set. Returns the number of items updated.
 */
export async function fillMenuPhotos(opts: { merchantId?: string; replace?: boolean } = {}) {
  let n = 0;
  for (const [name, p] of Object.entries(MENU_PHOTOS)) {
    const res = await prisma.menuItem.updateMany({
      where: {
        name: { equals: name, mode: "insensitive" },
        ...(opts.merchantId ? { merchantId: opts.merchantId } : {}),
        ...(opts.replace ? {} : { OR: [{ imageUrl: null }, { imageUrl: "" }] }),
      },
      data: { imageUrl: photoUrl(p.file) },
    });
    n += res.count;
  }
  return n;
}
