import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError } from "@/lib/errors";
import { adjustStock, createIngredient, deleteIngredient, lowStockIngredients } from "@/lib/services/inventory";
import { computeMaxServings, saveMenuItem } from "@/lib/services/menu";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { D, resetDb, seedBurgerScenario, stockOf } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("inventory adjustments", () => {
  it("records opening stock and converts kg/L input to base units", async () => {
    const flour = await createIngredient({
      name: "Flour",
      sku: "FLR-01",
      unit: "G",
      initialStock: "2500",
      lowStockThreshold: "500",
    });
    await adjustStock({ ingredientId: flour!.id, kind: "RESTOCK", quantity: "1.25", inputUnit: "kg", reason: "" });
    expect(await stockOf(flour!.id)).toBe("3750");

    const moves = await prisma.inventoryMovement.findMany({ where: { ingredientId: flour!.id }, orderBy: { createdAt: "asc" } });
    expect(moves.map((m) => m.movementType)).toEqual(["INITIAL", "RESTOCK"]);
    expect(moves[1].quantityChange.toString()).toBe("1250");
    expect(moves[1].balanceAfter.toString()).toBe("3750");
  });

  it("rejects incompatible units and deductions below zero", async () => {
    const s = await seedBurgerScenario();
    await expect(
      adjustStock({ ingredientId: s.lettuce.id, kind: "RESTOCK", quantity: "1", inputUnit: "L", reason: "" }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      adjustStock({ ingredientId: s.bun.id, kind: "DEDUCT", quantity: "21", inputUnit: "pcs", reason: "Spoiled" }),
    ).rejects.toThrow(/Cannot deduct/);
    await adjustStock({ ingredientId: s.bun.id, kind: "DEDUCT", quantity: "2", inputUnit: "pcs", reason: "Spoiled" });
    expect(await stockOf(s.bun.id)).toBe("18");
  });

  it("lists low-stock ingredients by comparing stock to each threshold", async () => {
    const s = await seedBurgerScenario();
    await prisma.ingredient.update({ where: { id: s.patty.id }, data: { currentStock: D(5) } });
    const low = await lowStockIngredients();
    expect(low.map((i) => i.name)).toEqual(["Chicken Patty"]);
  });

  it("blocks deleting ingredients used in recipes", async () => {
    const s = await seedBurgerScenario();
    await expect(deleteIngredient(s.bun.id)).rejects.toThrow(/recipe/);
  });
});

describe("menu recipes", () => {
  it("saves a recipe with unit conversion and replaces it on update", async () => {
    const s = await seedBurgerScenario();
    const id = await saveMenuItem(null, {
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

    await saveMenuItem(id, {
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
