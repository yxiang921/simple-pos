import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { DomainError, InsufficientStockError } from "@/lib/errors";
import { cancelOrder, createOrder, updateOrderStatus } from "@/lib/services/orders";
import { adjustStock } from "@/lib/services/inventory";
import { D, orderInput, resetDb, seedBurgerScenario, stockOf } from "./helpers";

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe("automatic ingredient deduction", () => {
  it("deducts recipe × quantity for the spec scenario (2 × Chicken Burger)", async () => {
    const s = await seedBurgerScenario();
    const res = await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 2 }]));

    expect(await stockOf(s.bun.id)).toBe("18");
    expect(await stockOf(s.patty.id)).toBe("13");
    expect(await stockOf(s.lettuce.id)).toBe("940");
    expect(await stockOf(s.mayo.id)).toBe("460");

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: res.id },
      include: { items: true, ingredients: true, movements: true },
    });
    expect(order.totalAmount.toFixed(2)).toBe("25.80");
    expect(order.status).toBe("PENDING");
    expect(order.paymentStatus).toBe("UNPAID");
    expect(order.items).toHaveLength(1);
    expect(order.items[0].unitPriceSnapshot.toFixed(2)).toBe("12.90");
    expect(order.items[0].menuItemNameSnapshot).toBe("Chicken Burger");
    expect(order.ingredients).toHaveLength(4);
    expect(order.movements).toHaveLength(4);
    const lettuceMove = order.movements.find((m) => m.ingredientId === s.lettuce.id)!;
    expect(lettuceMove.movementType).toBe("ORDER_DEDUCTION");
    expect(lettuceMove.quantityChange.toString()).toBe("-60");
    expect(lettuceMove.balanceAfter.toString()).toBe("940");
  });

  it("aggregates shared ingredients across the whole cart before checking stock", async () => {
    const s = await seedBurgerScenario();
    // A second item sharing buns: 1 bun + 1 patty each. 10 burgers + 6 doubles = 16 buns... buns = 20 OK,
    // patties = 10 + 12 = 22 > 15 → must reject even though each line alone fits.
    const double = await prisma.menuItem.create({
      data: {
        name: "Double Patty Burger",
        price: D("16.90"),
        categoryId: s.category.id,
        recipe: {
          create: [
            { ingredientId: s.bun.id, quantityRequired: D(1) },
            { ingredientId: s.patty.id, quantityRequired: D(2) },
          ],
        },
      },
    });
    const attempt = createOrder(
      orderInput([
        { menuItemId: s.burger.id, quantity: 10 },
        { menuItemId: double.id, quantity: 6 },
      ]),
    );
    await expect(attempt).rejects.toBeInstanceOf(InsufficientStockError);
    const err = (await attempt.catch((e) => e)) as InsufficientStockError;
    expect(err.shortages.map((x) => x.ingredientName)).toEqual(["Chicken Patty"]);
    expect(err.shortages[0].required).toBe("22");
    expect(err.shortages[0].affectedItems.sort()).toEqual(["Chicken Burger", "Double Patty Burger"]);

    // Nothing changed.
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.inventoryMovement.count()).toBe(0);
    expect(await stockOf(s.patty.id)).toBe("15");
    expect(await stockOf(s.bun.id)).toBe("20");
  });

  it("merges duplicate cart lines for the same item", async () => {
    const s = await seedBurgerScenario();
    const res = await createOrder(
      orderInput([
        { menuItemId: s.burger.id, quantity: 1 },
        { menuItemId: s.burger.id, quantity: 2 },
      ]),
    );
    const order = await prisma.order.findUniqueOrThrow({ where: { id: res.id }, include: { items: true } });
    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(3);
    expect(await stockOf(s.patty.id)).toBe("12");
  });

  it("rejects the order and changes nothing when stock is insufficient", async () => {
    const s = await seedBurgerScenario();
    await expect(createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 16 }]))).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
    expect(await prisma.order.count()).toBe(0);
    expect(await prisma.orderItem.count()).toBe(0);
    expect(await stockOf(s.bun.id)).toBe("20");
    expect(await stockOf(s.patty.id)).toBe("15");
  });

  it("allows an order that uses exactly all remaining stock, never going negative", async () => {
    const s = await seedBurgerScenario();
    await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 15 }]));
    expect(await stockOf(s.patty.id)).toBe("0");
    await expect(createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 1 }]))).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
    expect(await stockOf(s.patty.id)).toBe("0");
  });

  it("supports decimal quantities exactly (no floating-point drift)", async () => {
    const s = await seedBurgerScenario();
    await prisma.menuItemIngredient.updateMany({
      where: { menuItemId: s.burger.id, ingredientId: s.lettuce.id },
      data: { quantityRequired: D("0.1") },
    });
    for (let i = 0; i < 3; i++) await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 1 }]));
    expect(await stockOf(s.lettuce.id)).toBe("999.7");
  });

  it("rejects unavailable, archived, and unknown menu items", async () => {
    const s = await seedBurgerScenario();
    await prisma.menuItem.update({ where: { id: s.burger.id }, data: { isAvailable: false } });
    await expect(createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 1 }]))).rejects.toBeInstanceOf(DomainError);
    await expect(createOrder(orderInput([{ menuItemId: "does-not-exist", quantity: 1 }]))).rejects.toBeInstanceOf(
      DomainError,
    );
    expect(await prisma.order.count()).toBe(0);
  });

  it("treats a deactivated ingredient as out of stock", async () => {
    const s = await seedBurgerScenario();
    await prisma.ingredient.update({ where: { id: s.mayo.id }, data: { isActive: false } });
    await expect(createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 1 }]))).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
  });

  it("the CHECK constraint blocks negative stock even outside the service", async () => {
    const s = await seedBurgerScenario();
    await expect(
      prisma.ingredient.update({ where: { id: s.bun.id }, data: { currentStock: { decrement: 21 } } }),
    ).rejects.toThrow();
    expect(await stockOf(s.bun.id)).toBe("20");
  });
});

describe("cancellation and restoration", () => {
  it("restores exactly the snapshot quantities, even after the recipe changed", async () => {
    const s = await seedBurgerScenario();
    const res = await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 2 }]));

    // Recipe changes after the order must not affect what is restored.
    await prisma.menuItemIngredient.updateMany({
      where: { menuItemId: s.burger.id, ingredientId: s.lettuce.id },
      data: { quantityRequired: D(100) },
    });

    const out = await cancelOrder(res.id, "Customer left", "admin@test");
    expect(out.restoredIngredients).toBe(4);
    expect(await stockOf(s.bun.id)).toBe("20");
    expect(await stockOf(s.patty.id)).toBe("15");
    expect(await stockOf(s.lettuce.id)).toBe("1000");
    expect(await stockOf(s.mayo.id)).toBe("500");

    const order = await prisma.order.findUniqueOrThrow({ where: { id: res.id } });
    expect(order.status).toBe("CANCELLED");
    expect(order.stockRestoredAt).not.toBeNull();
    expect(order.cancelReason).toBe("Customer left");

    const restores = await prisma.inventoryMovement.findMany({
      where: { orderId: res.id, movementType: "ORDER_CANCELLATION" },
    });
    expect(restores).toHaveLength(4);
    expect(restores.find((m) => m.ingredientId === s.lettuce.id)!.quantityChange.toString()).toBe("60");
  });

  it("restores only once, including under concurrent cancel requests", async () => {
    const s = await seedBurgerScenario();
    const res = await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 3 }]));

    const results = await Promise.allSettled(Array.from({ length: 5 }, () => cancelOrder(res.id, "Duplicate click")));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results.filter((r) => r.status === "rejected")) {
      expect((r as PromiseRejectedResult).reason).toBeInstanceOf(DomainError);
    }
    expect(await stockOf(s.patty.id)).toBe("15");
    expect(
      await prisma.inventoryMovement.count({ where: { orderId: res.id, movementType: "ORDER_CANCELLATION" } }),
    ).toBe(4);

    await expect(cancelOrder(res.id, "again")).rejects.toThrow(/already cancelled/);
    expect(await stockOf(s.patty.id)).toBe("15");
  });

  it("does not allow cancelling completed orders, or moving cancelled orders", async () => {
    const s = await seedBurgerScenario();
    const a = await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 1 }]));
    await updateOrderStatus(a.id, "COMPLETED");
    await expect(cancelOrder(a.id, "late")).rejects.toThrow(/Completed/);
    expect(await stockOf(s.patty.id)).toBe("14");

    const b = await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 1 }]));
    await cancelOrder(b.id, "mistake");
    await expect(updateOrderStatus(b.id, "PREPARING")).rejects.toBeInstanceOf(DomainError);
  });

  it("restoration after restock keeps a correct running balance", async () => {
    const s = await seedBurgerScenario();
    const res = await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 5 }]));
    await adjustStock({ ingredientId: s.patty.id, kind: "RESTOCK", quantity: "10", inputUnit: "pcs", reason: "" });
    await cancelOrder(res.id, "Kitchen issue");
    expect(await stockOf(s.patty.id)).toBe("25");
    const last = await prisma.inventoryMovement.findFirstOrThrow({
      where: { ingredientId: s.patty.id, movementType: "ORDER_CANCELLATION" },
    });
    expect(last.balanceAfter.toString()).toBe("25");
  });
});

describe("concurrent ordering", () => {
  it("never oversells when many guests order the last items simultaneously", async () => {
    const s = await seedBurgerScenario();
    await prisma.ingredient.update({ where: { id: s.patty.id }, data: { currentStock: D(5) } });

    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 1 }]))),
    );
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];

    expect(ok).toHaveLength(5);
    expect(failed).toHaveLength(7);
    for (const f of failed) expect(f.reason).toBeInstanceOf(InsufficientStockError);
    expect(await stockOf(s.patty.id)).toBe("0");
    expect(await stockOf(s.bun.id)).toBe("15");
    expect(await prisma.order.count()).toBe(5);
    expect(
      await prisma.inventoryMovement.count({ where: { ingredientId: s.patty.id, movementType: "ORDER_DEDUCTION" } }),
    ).toBe(5);
  });

  it("handles concurrent multi-item orders over overlapping ingredients without deadlock", async () => {
    const s = await seedBurgerScenario();
    const fries = await prisma.ingredient.create({ data: { name: "Fries", unit: "G", currentStock: D(10000) } });
    const combo = await prisma.menuItem.create({
      data: {
        name: "Burger Combo",
        price: D("18.90"),
        categoryId: s.category.id,
        recipe: {
          create: [
            { ingredientId: fries.id, quantityRequired: D(150) },
            { ingredientId: s.mayo.id, quantityRequired: D(10) },
            { ingredientId: s.bun.id, quantityRequired: D(1) },
          ],
        },
      },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        createOrder(
          orderInput(
            i % 2
              ? [
                  { menuItemId: combo.id, quantity: 1 },
                  { menuItemId: s.burger.id, quantity: 1 },
                ]
              : [
                  { menuItemId: s.burger.id, quantity: 1 },
                  { menuItemId: combo.id, quantity: 1 },
                ],
          ),
        ),
      ),
    );
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    expect(await stockOf(s.bun.id)).toBe("0"); // 10 × (1 + 1)
    expect(await stockOf(s.mayo.id)).toBe("200"); // 500 − 10 × (20 + 10)
    expect(await stockOf(fries.id)).toBe("8500");
  });
});

describe("duplicate submission (idempotency)", () => {
  it("returns the original order on retry and deducts only once", async () => {
    const s = await seedBurgerScenario();
    const key = randomUUID();
    const first = await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 2 }], key));
    const retry = await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 2 }], key));

    expect(retry.id).toBe(first.id);
    expect(first.replayed).toBe(false);
    expect(retry.replayed).toBe(true);
    expect(await prisma.order.count()).toBe(1);
    expect(await stockOf(s.patty.id)).toBe("13");
  });

  it("deducts only once when the same request is fired concurrently", async () => {
    const s = await seedBurgerScenario();
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 2 }], key))),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect(await prisma.order.count()).toBe(1);
    expect(await prisma.inventoryMovement.count()).toBe(4);
    expect(await stockOf(s.patty.id)).toBe("13");
    expect(await stockOf(s.lettuce.id)).toBe("940");
  });

  it("rejects reuse of a key with a different cart", async () => {
    const s = await seedBurgerScenario();
    const key = randomUUID();
    await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 1 }], key));
    await expect(createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 5 }], key))).rejects.toThrow(
      /different cart/,
    );
    expect(await stockOf(s.patty.id)).toBe("14");
  });

  it("a failed attempt (insufficient stock) does not burn the key", async () => {
    const s = await seedBurgerScenario();
    const key = randomUUID();
    await expect(createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 20 }], key))).rejects.toBeInstanceOf(
      InsufficientStockError,
    );
    // Guest reduces the quantity and retries with the same checkout key.
    const ok = await createOrder(orderInput([{ menuItemId: s.burger.id, quantity: 2 }], key));
    expect(ok.replayed).toBe(false);
    expect(await stockOf(s.patty.id)).toBe("13");
  });
});
