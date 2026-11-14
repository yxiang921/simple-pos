import { prisma } from "@/lib/db";
import { DomainError, isUniqueViolation } from "@/lib/errors";

export type BranchInput = { name: string; slug: string; address: string };

/**
 * Open a new branch. It sells the merchant's shared menu and starts with zero
 * stock of every catalog ingredient (low-stock thresholds copied from headquarters).
 */
export async function createBranch(merchantId: string, input: BranchInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const count = await tx.branch.count({ where: { merchantId } });
      const branch = await tx.branch.create({
        data: { merchantId, name: input.name, slug: input.slug, address: input.address, sortOrder: count, isHeadquarters: count === 0 },
      });
      const hq = await tx.branch.findFirst({ where: { merchantId, isHeadquarters: true, id: { not: branch.id } }, select: { id: true } });
      const ingredients = await tx.ingredient.findMany({
        where: { merchantId },
        select: { id: true, stocks: { where: { branchId: hq?.id ?? "-" }, select: { lowStockThreshold: true } } },
      });
      if (ingredients.length) {
        await tx.ingredientStock.createMany({
          data: ingredients.map((i) => ({
            branchId: branch.id,
            ingredientId: i.id,
            currentStock: 0,
            lowStockThreshold: i.stocks[0]?.lowStockThreshold ?? 0,
          })),
        });
      }
      return branch;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("Another branch already uses this URL name.");
    throw err;
  }
}

/** Rename / move a branch, or close it (stops guest ordering; history is kept). HQ can't be closed. */
export async function updateBranch(merchantId: string, id: string, input: BranchInput & { isActive: boolean }) {
  const branch = await prisma.branch.findFirst({ where: { id, merchantId } });
  if (!branch) throw new DomainError("Branch not found.", "NOT_FOUND");
  if (branch.isHeadquarters && !input.isActive) throw new DomainError("Headquarters can't be closed.");
  try {
    return await prisma.branch.update({
      where: { id },
      data: { name: input.name, slug: input.slug, address: input.address, isActive: input.isActive },
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new DomainError("Another branch already uses this URL name.");
    throw err;
  }
}
