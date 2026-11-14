import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { adjustStock, createIngredient, deleteIngredient, lowStockIngredients } from "@/lib/services/inventory";
import { computeMaxServings, saveMenuItem } from "@/lib/services/menu";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { addBranch, D, resetDb, seedBurgerScenario, setStock, stockOf, T } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("inventory adjustments", () => {
  it("records opening stock and converts kg/L input to base units", async () => {
    const flour = await createIngredient(T.merchantId, T.branchId, {
      name: "Flour",
      sku: "FLR-01",
      unit: "G",
      initialStock: "2500",
      lowStockThreshold: "500",
    });
    await adjustStock(T.branchId, { ingredientId: flour!.id, kind: "RESTOCK", quantity: "1.25", inputUnit: "kg", reason: "" });
    expect(await stockOf(flour!.id)).toBe("3750");

    const moves = await prisma.inventoryMovement.findMany({ where: { ingredientId: flour!.id }, orderBy: { createdAt: "asc" } });
    expect(moves.map((m) => m.movementType)).toEqual(["INITIAL", "RESTOCK"]);
    expect(moves[1].quantityChange.toString()).toBe("1250");
    expect(moves[1].balanceAfter.toString()).toBe("3750");
  });

  it("rejects incompatible units and deductions below zero", async () => {
    const s = await seedBurgerScenario();
    await expect(
      adjustStock(T.branchId, { ingredientId: s.lettuce.id, kind: "RESTOCK", quantity: "1", inputUnit: "L", reason: "" }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      adjustStock(T.branchId, { ingredientId: s.bun.id, kind: "DEDUCT", quantity: "21", inputUnit: "pcs", reason: "Spoiled" }),
    ).rejects.toThrow(/Cannot deduct/);
    await adjustStock(T.branchId, { ingredientId: s.bun.id, kind: "DEDUCT", quantity: "2", inputUnit: "pcs", reason: "Spoiled" });
    expect(await stockOf(s.bun.id)).toBe("18");
  });

  it("lists low-stock ingredients by comparing stock to each threshold", async () => {
    const s = await seedBurgerScenario();
    await setStock(s.patty.id, 5);
    const low = await lowStockIngredients({ branchId: T.branchId });
    expect(low.map((i) => i.ingredient.name)).toEqual(["Chicken Patty"]);
    expect(await lowStockIngredients({ branch: { merchantId: T.merchantId } })).toHaveLength(1);
  });

  it("blocks deleting ingredients used in recipes", async () => {
    const s = await seedBurgerScenario();
    await expect(deleteIngredient(T.merchantId, s.bun.id)).rejects.toThrow(/recipe/);
  });
});

describe("stock per branch", () => {
  it("a new ingredient gets a stock row at every branch; opening stock goes to one branch", async () => {
    const other = await addBranch("mount-austin");
    const ing = await createIngredient(T.merchantId, other.id, { name: "Rice", sku: null, unit: "G", initialStock: "5000", lowStockThreshold: "1000" });
    expect(await stockOf(ing!.id, other.id)).toBe("5000");
    expect(await stockOf(ing!.id)).toBe("0");
    expect(await prisma.ingredientStock.count({ where: { ingredientId: ing!.id } })).toBe(2);
    const moves = await prisma.inventoryMovement.findMany({ where: { ingredientId: ing!.id } });
    expect(moves.map((m) => m.branchId)).toEqual([other.id]);
  });

  it("restocks one branch only and creates the stock row if missing", async () => {
    const s = await seedBurgerScenario();
    const other = await addBranch("skudai");
    await adjustStock(other.id, { ingredientId: s.bun.id, kind: "RESTOCK", quantity: "12", inputUnit: "pcs", reason: "" });
    expect(await stockOf(s.bun.id, other.id)).toBe("12");
    expect(await stockOf(s.bun.id)).toBe("20");
  });

  it("ingredient names are unique per merchant, not across merchants", async () => {
    const { createTenant } = await import("./helpers");
    await createIngredient(T.merchantId, T.branchId, { name: "Sugar", sku: "S1", unit: "G", initialStock: "0", lowStockThreshold: "0" });
    await expect(createIngredient(T.merchantId, T.branchId, { name: "Sugar", sku: null, unit: "G", initialStock: "0", lowStockThreshold: "0" })).rejects.toThrow(/already exists/);
    const other = await createTenant("other", "Other");
    await createIngredient(other.merchantId, other.branchId, { name: "Sugar", sku: "S1", unit: "G", initialStock: "0", lowStockThreshold: "0" });
    // and one merchant can't touch the other's stock
    const theirs = await prisma.ingredient.findFirstOrThrow({ where: { merchantId: other.merchantId } });
    await expect(adjustStock(T.branchId, { ingredientId: theirs.id, kind: "RESTOCK", quantity: "1", inputUnit: "g", reason: "" })).rejects.toThrow(/not found/);
    await expect(deleteIngredient(T.merchantId, theirs.id)).rejects.toThrow(/not found/);
  });
});

describe("menu recipes", () => {
  it("saves a recipe with unit conversion and replaces it on update", async () => {
    const s = await seedBurgerScenario();
    const id = await saveMenuItem(T.merchantId, null, {
      name: "Salad",
      description: "",
      price: "9.50",
      categoryId: s.category.id,
      imageUrl: null,
      isAvailable: true,
      isPreparedAhead: null,
      aliases: [],
      recipe: [{ ingredientId: s.lettuce.id, quantity: "0.15", inputUnit: "kg" }],
    });
    let recipe = await prisma.menuItemIngredient.findMany({ where: { menuItemId: id } });
    expect(recipe[0].quantityRequired.toString()).toBe("150");

    await saveMenuItem(T.merchantId, id, {
      name: "Salad",
      description: "",
      price: "9.50",
      categoryId: s.category.id,
      imageUrl: null,
      isAvailable: true,
      isPreparedAhead: null,
      aliases: [],
      recipe: [
        { ingredientId: s.lettuce.id, quantity: "100", inputUnit: "g" },
        { ingredientId: s.mayo.id, quantity: "15", inputUnit: "g" },
      ],
    });
    recipe = await prisma.menuItemIngredient.findMany({ where: { menuItemId: id } });
    expect(recipe).toHaveLength(2);
  });

  it("computes servings available from stock", () => {
    expect(
      computeMaxServings([
        { quantityRequired: D(30), ingredient: { currentStock: D(100), isActive: true } },
        { quantityRequired: D(1), ingredient: { currentStock: D(10), isActive: true } },
      ]),
    ).toBe(3);
    expect(computeMaxServings([])).toBeNull();
    expect(computeMaxServings([{ quantityRequired: D(1), ingredient: { currentStock: D(10), isActive: false } }])).toBe(0);
  });
});

describe("password hashing", () => {
  it("verifies correct passwords and rejects wrong ones", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
  });
});
