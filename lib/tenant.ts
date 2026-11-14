import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentAdmin, requireAdmin, type CurrentAdmin } from "@/lib/auth/session";
import { DomainError } from "@/lib/errors";
import { DEFAULT_TZ } from "@/lib/time";

/**
 * Tenancy. A merchant owns branches; the signed-in owner can see and change
 * every branch of their merchant. The back office works either on one branch
 * or on "All branches" (the headquarters overview) — chosen with the branch
 * switcher and remembered in the `pos_branch` cookie.
 */

export const BRANCH_COOKIE = "pos_branch";
export const ALL_BRANCHES = "all";

export type BranchInfo = { id: string; slug: string; name: string; isHeadquarters: boolean; isActive: boolean; address: string };
export type MerchantInfo = { id: string; slug: string; name: string };
export type MerchantSettings = {
  storeName: string;
  acceptingOrders: boolean;
  openTime: string | null;
  closeTime: string | null;
  timezone: string;
  floorWidth: number;
  floorDepth: number;
  orderAlertMinutes: number;
};

export type AdminContext = {
  admin: CurrentAdmin;
  merchant: MerchantInfo;
  /** All branches, headquarters first. */
  branches: BranchInfo[];
  hq: BranchInfo;
  /** The selected branch, or null for "All branches". */
  branch: BranchInfo | null;
  settings: MerchantSettings;
};

const BRANCH_SELECT = { id: true, slug: true, name: true, isHeadquarters: true, isActive: true, address: true } as const;

export function sortBranches<T extends { isHeadquarters: boolean; name: string; sortOrder?: number }>(list: T[]): T[] {
  return [...list].sort(
    (a, b) => Number(b.isHeadquarters) - Number(a.isHeadquarters) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name),
  );
}

export const DEFAULT_SETTINGS: Omit<MerchantSettings, "storeName"> = {
  acceptingOrders: true,
  openTime: null,
  closeTime: null,
  timezone: DEFAULT_TZ,
  floorWidth: 14,
  floorDepth: 10,
  orderAlertMinutes: 20,
};

/** Settings shared by all of a merchant's branches (created with defaults if missing). */
export async function getMerchantSettings(merchantId: string): Promise<MerchantSettings> {
  const s = await prisma.storeSetting.findUnique({ where: { merchantId } });
  if (s) {
    const { storeName, acceptingOrders, openTime, closeTime, timezone, floorWidth, floorDepth, orderAlertMinutes } = s;
    return { storeName, acceptingOrders, openTime, closeTime, timezone: timezone || DEFAULT_TZ, floorWidth, floorDepth, orderAlertMinutes };
  }
  const m = await prisma.merchant.findUniqueOrThrow({ where: { id: merchantId }, select: { name: true } });
  return { storeName: m.name, ...DEFAULT_SETTINGS };
}

export async function merchantTimezone(merchantId: string): Promise<string> {
  const s = await prisma.storeSetting.findUnique({ where: { merchantId }, select: { timezone: true } });
  return s?.timezone || DEFAULT_TZ;
}

async function loadContext(admin: CurrentAdmin): Promise<AdminContext> {
  const merchant = await prisma.merchant.findUniqueOrThrow({
    where: { id: admin.merchantId },
    select: { id: true, slug: true, name: true, branches: { select: { ...BRANCH_SELECT, sortOrder: true } } },
  });
  const branches: BranchInfo[] = sortBranches(merchant.branches).map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    isHeadquarters: b.isHeadquarters,
    isActive: b.isActive,
    address: b.address,
  }));
  const hq = branches.find((b) => b.isHeadquarters) ?? branches[0];
  if (!hq) throw new Error(`Merchant ${merchant.slug} has no branches.`);

  const jar = await cookies();
  const wanted = jar.get(BRANCH_COOKIE)?.value;
  // Single-branch merchants always work on that branch; otherwise default to the HQ overview.
  const branch = branches.length === 1 ? hq : wanted && wanted !== ALL_BRANCHES ? (branches.find((b) => b.id === wanted) ?? null) : null;

  return {
    admin,
    merchant: { id: merchant.id, slug: merchant.slug, name: merchant.name },
    branches,
    hq,
    branch,
    settings: await getMerchantSettings(merchant.id),
  };
}

const contextFor = cache(async () => {
  const admin = await getCurrentAdmin();
  return admin ? loadContext(admin) : null;
});

/** Use at the top of every admin page and server action. Redirects to login when signed out. */
export async function requireContext(): Promise<AdminContext> {
  await requireAdmin();
  const ctx = await contextFor();
  if (!ctx) throw new Error("unreachable");
  return ctx;
}

/** Prisma filter for branch-owned rows (orders, movements, prep…) in the current view. */
export function branchFilter(ctx: AdminContext, branchId?: string | null) {
  const id = branchId ?? ctx.branch?.id;
  if (id) {
    assertBranch(ctx, id);
    return { branchId: id };
  }
  return { branch: { merchantId: ctx.merchant.id } };
}

/** Throws unless the branch belongs to the signed-in merchant. */
export function assertBranch(ctx: AdminContext, branchId: string): BranchInfo {
  const b = ctx.branches.find((x) => x.id === branchId);
  if (!b) throw new DomainError("Branch not found.", "NOT_FOUND");
  return b;
}

/** The branch an action applies to: the selected one, or an explicit id (validated). */
export function targetBranch(ctx: AdminContext, branchId?: string | null): BranchInfo {
  if (branchId) return assertBranch(ctx, branchId);
  if (ctx.branch) return ctx.branch;
  throw new DomainError("Choose a branch first.", "BRANCH_REQUIRED");
}

// ─── Ownership checks for ids coming from the browser ──────────────────

export async function assertOrder(ctx: AdminContext, orderId: string) {
  const o = await prisma.order.findFirst({ where: { id: orderId, branch: { merchantId: ctx.merchant.id } }, select: { id: true, branchId: true } });
  if (!o) throw new DomainError("Order not found.", "NOT_FOUND");
  return o;
}

export async function assertMenuItem(ctx: AdminContext, id: string) {
  const m = await prisma.menuItem.findFirst({ where: { id, merchantId: ctx.merchant.id }, select: { id: true } });
  if (!m) throw new DomainError("Menu item not found.", "NOT_FOUND");
}

export async function assertCategory(ctx: AdminContext, id: string) {
  const c = await prisma.category.findFirst({ where: { id, merchantId: ctx.merchant.id }, select: { id: true } });
  if (!c) throw new DomainError("Category not found.", "NOT_FOUND");
}

export async function assertIngredient(ctx: AdminContext, id: string) {
  const i = await prisma.ingredient.findFirst({ where: { id, merchantId: ctx.merchant.id }, select: { id: true } });
  if (!i) throw new DomainError("Ingredient not found.", "NOT_FOUND");
}

export async function assertExpense(ctx: AdminContext, id: string) {
  const e = await prisma.expense.findFirst({ where: { id, merchantId: ctx.merchant.id }, select: { id: true } });
  if (!e) throw new DomainError("Running cost not found.", "NOT_FOUND");
}

// ─── Guest side ────────────────────────────────────────────────────────

export type GuestShop = { merchant: MerchantInfo; branch: BranchInfo; settings: MerchantSettings };

/** Resolve /s/[merchant]/[branch]. Null when unknown or the branch is closed down. */
export const getGuestShop = cache(async (merchantSlug: string, branchSlug: string): Promise<GuestShop | null> => {
  if (!/^[a-z0-9-]{1,40}$/.test(merchantSlug) || !/^[a-z0-9-]{1,40}$/.test(branchSlug)) return null;
  const branch = await prisma.branch.findFirst({
    where: { slug: branchSlug, isActive: true, merchant: { slug: merchantSlug } },
    select: { ...BRANCH_SELECT, merchant: { select: { id: true, slug: true, name: true } } },
  });
  if (!branch) return null;
  const { merchant, ...b } = branch;
  return { merchant, branch: b, settings: await getMerchantSettings(merchant.id) };
});

export function guestPath(merchantSlug: string, branchSlug: string, rest = "") {
  return `/s/${merchantSlug}/${branchSlug}${rest}`;
}
