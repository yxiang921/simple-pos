import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/password";
import { createBranch, updateBranch } from "@/lib/services/branches";
import { registerMerchant } from "@/lib/services/merchants";
import { getGuestMenu } from "@/lib/services/menu";
import { registerSchema } from "@/lib/validation";
import { slugify } from "@/lib/slug";
import { resetDb, seedBurgerScenario, setStock, stockOf, T } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

const signup = (over: Partial<Parameters<typeof registerMerchant>[0]> = {}) =>
  registerMerchant({
    businessName: "Nasi Kandar Bistro",
    slug: "nasi-kandar-bistro",
    ownerName: "Ali",
    email: "ali@example.com",
    password: "a-long-password",
    branches: [],
    sampleData: false,
    ...over,
  });

describe("merchant registration", () => {
  it("creates a single-outlet merchant with settings, a headquarters branch and the owner", async () => {
    const r = await signup();
    const m = await prisma.merchant.findUniqueOrThrow({ where: { id: r.merchantId }, include: { branches: true, settings: true, users: true } });
    expect(m.slug).toBe("nasi-kandar-bistro");
    expect(m.branches.map((b) => [b.slug, b.isHeadquarters])).toEqual([["hq", true]]);
    expect(m.settings?.storeName).toBe("Nasi Kandar Bistro");
    expect(m.users[0].email).toBe("ali@example.com");
    expect(await verifyPassword("a-long-password", m.users[0].passwordHash)).toBe(true);
  });

  it("creates branches with unique URL names and can start with the sample catalog", async () => {
    const r = await signup({ branches: ["Mount Austin", "Skudai", "Mount Austin!"], sampleData: true });
    const branches = await prisma.branch.findMany({ where: { merchantId: r.merchantId }, orderBy: { sortOrder: "asc" } });
    expect(branches.map((b) => b.slug)).toEqual(["hq", "mount-austin", "skudai", "mount-austin-2"]);
    const ingredients = await prisma.ingredient.count({ where: { merchantId: r.merchantId } });
    expect(ingredients).toBeGreaterThan(20);
    // every branch has a stock row for every ingredient
    expect(await prisma.ingredientStock.count({ where: { branch: { merchantId: r.merchantId } } })).toBe(ingredients * 4);
    expect(await prisma.floorObject.count({ where: { merchantId: r.merchantId } })).toBeGreaterThan(0);
    const menu = await getGuestMenu(branches[1].id);
    expect(menu.items.length).toBeGreaterThan(10);
  });

  it("rejects a taken shop URL, a reserved one and a used email", async () => {
    await signup();
    await expect(signup({ email: "other@example.com" })).rejects.toThrow(/already taken/);
    await expect(signup({ slug: "admin", email: "x@example.com" })).rejects.toThrow(/already taken/);
    await expect(signup({ slug: "another-shop" })).rejects.toThrow(/already exists/);
    expect(registerSchema.safeParse({ businessName: "X Y", slug: "register", ownerName: "a", email: "a@b.co", password: "0123456789" }).success).toBe(false);
  });

  it("parses the sign-up form (branches one per line only when chosen)", () => {
    const base = { businessName: "Kopi Place", slug: "kopi-place", ownerName: "A", email: "A@B.CO", password: "0123456789" };
    expect(registerSchema.parse({ ...base, branchNames: "One\nTwo" }).branches).toEqual([]);
    const withBranches = registerSchema.parse({ ...base, hasBranches: "true", branchNames: " One \n\nTwo\nOne", sampleData: "true" });
    expect(withBranches).toMatchObject({ branches: ["One", "Two"], sampleData: true, email: "a@b.co" });
    expect(registerSchema.safeParse({ ...base, hasBranches: "true", branchNames: "" }).success).toBe(false);
    expect(slugify("Kopi & Co.")).toBe("kopi-and-co");
    expect(slugify("Café Déjà Vu")).toBe("cafe-deja-vu");
  });
});

describe("branches", () => {
  it("a new branch shares the menu and starts with zero stock (thresholds from HQ)", async () => {
    const s = await seedBurgerScenario();
    const b = await createBranch(T.merchantId, { name: "Skudai", slug: "skudai", address: "" });
    expect(await stockOf(s.patty.id, b.id)).toBe("0");
    const row = await prisma.ingredientStock.findUniqueOrThrow({ where: { branchId_ingredientId: { branchId: b.id, ingredientId: s.patty.id } } });
    expect(row.lowStockThreshold.toString()).toBe("5");
    const menu = await getGuestMenu(b.id);
    expect(menu.items.map((i) => [i.name, i.maxServings])).toEqual([["Chicken Burger", 0]]); // sold out until restocked
    await setStock(s.patty.id, 3, b.id);
    for (const id of [s.bun.id, s.lettuce.id, s.mayo.id]) await setStock(id, 1000, b.id);
    expect((await getGuestMenu(b.id)).items[0].maxServings).toBe(3);
    await expect(createBranch(T.merchantId, { name: "Again", slug: "skudai", address: "" })).rejects.toThrow(/already uses/);
  });

  it("headquarters can't be closed; other branches can", async () => {
    const b = await createBranch(T.merchantId, { name: "Skudai", slug: "skudai", address: "" });
    await expect(updateBranch(T.merchantId, T.branchId, { name: "HQ", slug: "hq", address: "", isActive: false })).rejects.toThrow(/can't be closed/);
    await updateBranch(T.merchantId, b.id, { name: "Skudai", slug: "skudai", address: "", isActive: false });
    expect((await prisma.branch.findUniqueOrThrow({ where: { id: b.id } })).isActive).toBe(false);
    const { createOrder } = await import("@/lib/services/orders");
    await expect(
      createOrder(b.id, { customerName: "x", idempotencyKey: crypto.randomUUID(), items: [{ menuItemId: "x", quantity: 1 }] }),
    ).rejects.toThrow(/not taking orders/);
  });

  it("one merchant can't edit another merchant's branch", async () => {
    const { createTenant } = await import("./helpers");
    const other = await createTenant("other", "Other");
    await expect(updateBranch(T.merchantId, other.branchId, { name: "x", slug: "x", address: "", isActive: true })).rejects.toThrow(/not found/);
  });
});
