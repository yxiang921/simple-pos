import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
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
  recipe: { ingredientId: string; quantity: string; inputUnit: InputUnit }[];
};

/** Create (id = null) or update a menu item and replace its recipe atomically. */
export async function saveMenuItem(id: string | null, input: MenuItemInput) {
  return prisma.$transaction(async (tx) => {
    const category = await tx.category.findUnique({ where: { id: input.categoryId } });
    if (!category) throw new DomainError("Selected category does not exist.");

    const ingredientIds = input.recipe.map((r) => r.ingredientId);
    const ingredients = await tx.ingredient.findMany({ where: { id: { in: ingredientIds } } });
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
    };

    let itemId: string;
    if (id) {
      const existing = await tx.menuItem.findUnique({ where: { id } });
      if (!existing || existing.isArchived) throw new DomainError("Menu item not found.", "NOT_FOUND");
      await tx.menuItem.update({ where: { id }, data });
      await tx.menuItemIngredient.deleteMany({ where: { menuItemId: id } });
      itemId = id;
    } else {
      itemId = (await tx.menuItem.create({ data, select: { id: true } })).id;
    }
    if (recipe.length) {
      await tx.menuItemIngredient.createMany({
        data: recipe.map((r) => ({ ...r, menuItemId: itemId })),
      });
    }
    return itemId;
  });
}

/** Hard-delete never-ordered items; archive (soft delete) items with order history. */
export async function deleteMenuItem(id: string): Promise<"deleted" | "archived"> {
  const orders = await prisma.orderItem.count({ where: { menuItemId: id } });
  if (orders === 0) {
    await prisma.menuItem.delete({ where: { id } });
    return "deleted";
  }
  await prisma.menuItem.update({ where: { id }, data: { isArchived: true, isAvailable: false } });
  return "archived";
}

export async function setMenuItemAvailability(id: string, isAvailable: boolean) {
  await prisma.menuItem.update({ where: { id }, data: { isAvailable } });
}

// ─── Categories ────────────────────────────────────────────────────────

export async function saveCategory(id: string | null, input: { name: string; sortOrder: number; isActive: boolean }) {
  try {
    if (id) return await prisma.category.update({ where: { id }, data: input });
    return await prisma.category.create({ data: input });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("A category with this name already exists.");
    throw err;
  }
}

export async function deleteCategory(id: string) {
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

export async function getGuestMenu(): Promise<GuestMenu> {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      menuItems: {
        where: { isArchived: false, isAvailable: true },
        orderBy: { name: "asc" },
        include: {
          recipe: {
            select: {
              quantityRequired: true,
              ingredient: { select: { currentStock: true, isActive: true } },
            },
          },
        },
      },
    },
  });

  const withItems = categories.filter((c) => c.menuItems.length > 0);
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
        maxServings: computeMaxServings(m.recipe),
      })),
    ),
  };
}
