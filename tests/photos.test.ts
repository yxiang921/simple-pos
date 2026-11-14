import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { MENU_PHOTOS, photoCredit, photoUrl, samplePhotoFor } from "@/lib/menu-photos";
import { SAMPLE_MENU } from "@/lib/sample-catalog";
import { fillMenuPhotos } from "../scripts/lib/photos";
import { resetDb, seedBurgerScenario, T } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("menu photos", () => {
  it("every sample dish has a credited photo with a Commons URL", () => {
    for (const m of SAMPLE_MENU) {
      const url = samplePhotoFor(m.name);
      expect(url, m.name).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\/[^?\s]+\?width=640$/);
      expect(photoCredit(url)).toMatchObject({ author: MENU_PHOTOS[m.name].author });
    }
    expect(photoUrl("Teh Tarik.jpg", 320)).toBe("https://commons.wikimedia.org/wiki/Special:FilePath/Teh_Tarik.jpg?width=320");
    expect(photoCredit("https://example.com/own.jpg")).toBeNull();
  });

  it("fills only items without a photo unless replace is set", async () => {
    const s = await seedBurgerScenario(); // "Chicken Burger"
    await prisma.menuItem.create({ data: { merchantId: T.merchantId, categoryId: s.category.id, name: "Teh Tarik", price: "3.80", imageUrl: "https://example.com/mine.jpg" } });
    expect(await fillMenuPhotos({ merchantId: T.merchantId })).toBe(1);
    expect((await prisma.menuItem.findFirstOrThrow({ where: { name: "Teh Tarik" } })).imageUrl).toBe("https://example.com/mine.jpg");
    expect(await fillMenuPhotos({ merchantId: T.merchantId, replace: true })).toBe(2);
    expect((await prisma.menuItem.findFirstOrThrow({ where: { name: "Teh Tarik" } })).imageUrl).toBe(samplePhotoFor("Teh Tarik"));
  });
});
