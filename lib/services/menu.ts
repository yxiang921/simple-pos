import { Prisma } from "@/lib/generated/prisma/client";
import { randomUUID } from "node:crypto";
import { prisma, table, type TxClient } from "@/lib/db";
import { DomainError, isUniqueViolation } from "@/lib/errors";
import { toBaseUnit, type InputUnit } from "@/lib/units";

const D = Prisma.Decimal;

export type MenuItemInput = {
  name: string;
  description: string;
  price: string;
  categoryId: string;
  imageUrl: string | null;
  isAvailable: boolean;
  isPreparedAhead: boolean | null;
  aliases: string[];
  recipe: { ingredientId: string; quantity: string; inputUnit: InputUnit }[];
};

/**
 * Create (id = null) or update one of the merchant's menu items (shared by all
 * branches) and replace its recipe atomically.
 */
export async function saveMenuItem(merchantId: string, id: string | null, input: MenuItemInput) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.category.findFirst({ where: { id: input.categoryId, merchantId } });
    if (!category) throw new DomainError("Selected category does not exist.");

    const ingredientIds = input.recipe.map((r) => r.ingredientId);
    const ingredients = await tx.ingredient.findMany({ where: { id: { in: ingredientIds }, merchantId } });
    const byId = new Map(ingredients.map((i) => [i.id, i]));

    const recipe = input.recipe.map((line) => {
      const ing = byId.get(line.ingredientId);
      if (!ing) throw new DomainError("A recipe ingredient no longer exists. Refresh and try again.");
      const qty = toBaseUnit(line.quantity, line.inputUnit, ing.unit);
      if (qty.lte(0)) throw new DomainError(`Quantity for ${ing.name} must be greater than 0.`);
      if (qty.gt(new D("999999999.999"))) throw new DomainError(`Quantity for ${ing.name} is too large.`);
      return { ingredientId: ing.id, quantityRequired: qty };
    });

    const data = {
      name: input.name,
      description: input.description,
      price: new D(input.price),
      categoryId: input.categoryId,
      imageUrl: input.imageUrl,
      isAvailable: input.isAvailable,
      isPreparedAhead: input.isPreparedAhead,
      aliases: input.aliases,
    };

    let itemId: string;
    if (id) {
      const existing = await tx.menuItem.findFirst({ where: { id, merchantId } });
      if (!existing || existing.isArchived) throw new DomainError("Menu item not found.", "NOT_FOUND");
      await tx.menuItem.update({ where: { id }, data });
      // Switching an item off records when it sold out (demand-planning signal).
      if (existing.isAvailable && !input.isAvailable) await recordSoldOut(tx, merchantId, id, null);
      await tx.menuItemIngredient.deleteMany({ where: { menuItemId: id } });
      itemId = id;
    } else {
      itemId = (await tx.menuItem.create({ data: { merchantId, ...data }, select: { id: true } })).id;
    }
    if (recipe.length) {
      await tx.menuItemIngredient.createMany({
        data: recipe.map((r) => ({ ...r, menuItemId: itemId })),
      });
    }
    return itemId;
  });
}

/**
 * Record a sold-out event for one branch, or (branchId null) for every active
 * branch where the item was still on sale.
 */
async function recordSoldOut(tx: TxClient, merchantId: string, menuItemId: string, branchId: string | null) {
  if (branchId) {
    await tx.soldOutEvent.create({ data: { branchId, menuItemId } });
    return;
  }
  const branches = await tx.branch.findMany({
    where: { merchantId, isActive: true, NOT: { menuStatus: { some: { menuItemId, isAvailable: false } } } },
    select: { id: true },
  });
  if (branches.length) await tx.soldOutEvent.createMany({ data: branches.map((b) => ({ branchId: b.id, menuItemId })) });
}

/** Hard-delete items with no history; archive (soft delete) items with orders, prep or sold-out records. */
export async function deleteMenuItem(merchantId: string, id: string): Promise<"deleted" | "archived"> {
  if (!(await prisma.menuItem.findFirst({ where: { id, merchantId }, select: { id: true } }))) {
    throw new DomainError("Menu item not found.", "NOT_FOUND");
  }
  const [orders, preps, soldOuts] = await Promise.all([
    prisma.orderItem.count({ where: { menuItemId: id } }),
    prisma.dailyPrep.count({ where: { menuItemId: id } }),
    prisma.soldOutEvent.count({ where: { menuItemId: id } }),
  ]);
  if (orders + preps + soldOuts === 0) {
    await prisma.menuItem.delete({ where: { id } });
    return "deleted";
  }
  await prisma.menuItem.update({ where: { id }, data: { isArchived: true, isAvailable: false } });
  return "archived";
}

/**
 * Toggle availability at one branch (branchId), or on the shared menu for all
 * branches (branchId null). Turning an item OFF records sold_out_events rows in
 * the same transaction; repeated clicks record only once.
 */
export async function setMenuItemAvailability(merchantId: string, id: string, isAvailable: boolean, branchId: string | null = null) {
  await prisma.$transaction(async (tx) => {
    const item = await tx.menuItem.findFirst({ where: { id, merchantId }, select: { id: true, isArchived: true } });
    if (!item) throw new DomainError("Menu item not found.", "NOT_FOUND");
    if (item.isArchived) return;

    if (!branchId) {
      const res = await tx.menuItem.updateMany({ where: { id, isAvailable: !isAvailable }, data: { isAvailable } });
      if (res.count && !isAvailable) await recordSoldOut(tx, merchantId, id, null);
      return;
    }

    const branch = await tx.branch.findFirst({ where: { id: branchId, merchantId }, select: { id: true } });
    if (!branch) throw new DomainError("Branch not found.", "NOT_FOUND");
    // Lock the (branch, item) row so two clicks can't both record a sold-out event.
    await tx.$executeRaw`
      INSERT INTO ${table("branch_menu_items")} (id, branch_id, menu_item_id, is_available, updated_at)
      VALUES (${randomUUID()}, ${branchId}, ${id}, true, now())
      ON CONFLICT (branch_id, menu_item_id) DO NOTHING`;
    const res = await tx.branchMenuItem.updateMany({
      where: { branchId, menuItemId: id, isAvailable: !isAvailable },
      data: { isAvailable },
    });
    if (res.count && !isAvailable) await recordSoldOut(tx, merchantId, id, branchId);
  });
}

// ─── Categories ────────────────────────────────────────────────────────

export async function saveCategory(merchantId: string, id: string | null, input: { name: string; sortOrder: number; isActive: boolean }) {
  try {
    if (id) {
      const res = await prisma.category.updateMany({ where: { id, merchantId }, data: input });
      if (!res.count) throw new DomainError("Category not found.", "NOT_FOUND");
      return await prisma.category.findUniqueOrThrow({ where: { id } });
    }
    return await prisma.category.create({ data: { merchantId, ...input } });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("A category with this name already exists.");
    throw err;
  }
}

export async function deleteCategory(merchantId: string, id: string) {
  if (!(await prisma.category.findFirst({ where: { id, merchantId }, select: { id: true } }))) {
    throw new DomainError("Category not found.", "NOT_FOUND");
  }
  const count = await prisma.menuItem.count({ where: { categoryId: id } });
  if (count > 0) {
    throw new DomainError(
      `This category still has ${count} menu item(s), including archived ones. Move them to another category or deactivate the category instead.`,
    );
  }
  await prisma.category.delete({ where: { id } });
}

// ─── Guest menu ────────────────────────────────────────────────────────

export type GuestMenuItem = {
  id: string;
  name: string;
  description: string;
  price: string;
  imageUrl: string | null;
  categoryId: string;
  /** Servings that can be made from current stock; null = no recipe (unlimited). */
  maxServings: number | null;
};

export type GuestMenu = {
  categories: { id: string; name: string }[];
  items: GuestMenuItem[];
};

/** Servings possible from stock: min over recipe of floor(stock / required). */
export function computeMaxServings(
  recipe: { quantityRequired: Prisma.Decimal; ingredient: { currentStock: Prisma.Decimal; isActive: boolean } }[],
): number | null {
  if (recipe.length === 0) return null;
  let max = Infinity;
  for (const r of recipe) {
    if (!r.ingredient.isActive) return 0;
    const servings = r.ingredient.currentStock.div(r.quantityRequired).floor().toNumber();
    max = Math.min(max, servings);
  }
  return Math.max(0, Math.min(max, 999));
}

/** The shared menu as one branch sells it: its availability and servings from its own stock. */
export async function getGuestMenu(branchId: string): Promise<GuestMenu> {
  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { merchantId: true } });
  if (!branch) return { categories: [], items: [] };
  const categories = await prisma.category.findMany({
    where: { merchantId: branch.merchantId, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      menuItems: {
        where: { isArchived: false, isAvailable: true, NOT: { branchStatus: { some: { branchId, isAvailable: false } } } },
        orderBy: { name: "asc" },
        include: {
          recipe: {
            select: {
              quantityRequired: true,
              ingredient: {
                select: { isActive: true, stocks: { where: { branchId }, select: { currentStock: true } } },
              },
            },
          },
        },
      },
    },
  });

  const withItems = categories.filter((c) => c.menuItems.length > 0);
  const zero = new D(0);
  return {
    categories: withItems.map((c) => ({ id: c.id, name: c.name })),
    items: withItems.flatMap((c) =>
      c.menuItems.map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        price: m.price.toFixed(2),
        imageUrl: m.imageUrl,
        categoryId: c.id,
        maxServings: computeMaxServings(
          m.recipe.map((r) => ({
            quantityRequired: r.quantityRequired,
            ingredient: { isActive: r.ingredient.isActive, currentStock: r.ingredient.stocks[0]?.currentStock ?? zero },
          })),
        ),
      })),
    ),
  };
}
