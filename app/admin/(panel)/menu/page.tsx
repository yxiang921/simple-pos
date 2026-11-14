import type { Metadata } from "next";
import { idParam, textParam } from "@/lib/params";
import { Plus } from "lucide-react";
import { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { computeMaxServings } from "@/lib/services/menu";
import { formatDateTime, formatRM } from "@/lib/format";
import { requireContext } from "@/lib/tenant";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Badge, EmptyState, PageHeader, Panel, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { MenuTabs } from "./menu-tabs";
import { MenuRowActions } from "./menu-row-actions";
import { SavedToast } from "./saved-toast";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage({ searchParams }: PageProps<"/admin/menu">) {
  const sp = await searchParams;
  const ctx = await requireContext();
  const branchId = ctx.branch?.id ?? null;
  const activeBranches = ctx.branches.filter((b) => b.isActive);
  const q = textParam(sp.q);
  const categoryId = idParam(sp.category);

  const where: Prisma.MenuItemWhereInput = { merchantId: ctx.merchant.id, isArchived: false };
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (categoryId) where.categoryId = categoryId;

  const [items, categories] = await Promise.all([
    prisma.menuItem.findMany({
      where,
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      include: {
        category: { select: { name: true, isActive: true } },
        recipe: {
          include: {
            ingredient: { select: { isActive: true, stocks: { where: { branchId: branchId ?? "-" }, select: { currentStock: true } } } },
          },
        },
        branchStatus: { where: { isAvailable: false }, select: { branchId: true } },
      },
    }),
    prisma.category.findMany({ where: { merchantId: ctx.merchant.id }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <>
      <SavedToast />
      <PageHeader
        title="Menu"
        description={
          ctx.branches.length > 1
            ? branchId
              ? `The menu is shared by all branches. Hide / Show here only affects ${ctx.branch!.name}; stock figures are this branch's.`
              : "The menu is shared by all branches. In this view Hide / Show applies to every branch."
            : "Items, prices and the ingredient recipe used for stock deduction."
        }
        actions={
          <ButtonLink href="/admin/menu/new" variant="primary">
            <Plus /> New item
          </ButtonLink>
        }
      />
      <MenuTabs active="items" />

      <form className="mb-3 flex flex-wrap gap-2" action="/admin/menu">
        <Input name="q" defaultValue={q} placeholder="Search menu items" className="h-8 w-56" aria-label="Search" />
        <Select name="category" defaultValue={categoryId} className="h-8 w-48" aria-label="Category">
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <button className={buttonClass("secondary")} type="submit">
          Filter
        </button>
      </form>

      <Panel>
        {items.length === 0 ? (
          <EmptyState
            title={q || categoryId ? "No items match your filters" : "No menu items yet"}
            description={categories.length === 0 ? "Create a category first, then add menu items." : "Add your first item and its recipe."}
            action={
              <ButtonLink href={categories.length ? "/admin/menu/new" : "/admin/menu/categories"} variant="primary">
                {categories.length ? "New item" : "Create category"}
              </ButtonLink>
            }
          />
        ) : (
          <Table>
            <THead>
              <tr>
                <TH>Item</TH>
                <TH>Category</TH>
                <TH className="text-right">Price</TH>
                <TH className="text-right">Recipe</TH>
                {branchId && <TH className="text-right">Can make</TH>}
                <TH>Status</TH>
                <TH>Updated</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {items.map((m) => {
                const servings = branchId
                  ? computeMaxServings(
                      m.recipe.map((r) => ({
                        quantityRequired: r.quantityRequired,
                        ingredient: { isActive: r.ingredient.isActive, currentStock: r.ingredient.stocks[0]?.currentStock ?? new Prisma.Decimal(0) },
                      })),
                    )
                  : null;
                const offHere = branchId ? m.branchStatus.some((b) => b.branchId === branchId) : false;
                const offAt = activeBranches.filter((b) => m.branchStatus.some((x) => x.branchId === b.id));
                return (
                  <TR key={m.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        {m.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.imageUrl} alt="" className="size-10 shrink-0 rounded-[10px] border border-line object-cover shadow-[0_2px_6px_-2px_rgb(0_0_0/0.2)]" />
                        ) : (
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-primary-soft to-fill text-[12px] font-semibold text-primary">
                            {m.name.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-medium">{m.name}</p>
                          <p className="max-w-[320px] truncate text-[12px] text-muted">
                            {m.isPreparedAhead === true ? "Prepared ahead" : m.isPreparedAhead === false ? "Made to order" : null}
                            {m.isPreparedAhead !== null && m.description ? " · " : null}
                            {m.description}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {m.category.name}
                      {!m.category.isActive && <span className="ml-1 text-[12px] text-muted">(hidden)</span>}
                    </TD>
                    <TD className="tabular text-right">{formatRM(m.price.toString())}</TD>
                    <TD className="tabular text-right">
                      {m.recipe.length ? `${m.recipe.length} ingr.` : <span className="text-warning">None</span>}
                    </TD>
                    {branchId && (
                    <TD className="tabular text-right">
                      {servings === null ? (
                        <span className="text-muted">—</span>
                      ) : servings === 0 ? (
                        <Badge tone="danger">Sold out</Badge>
                      ) : (
                        <span className={servings <= 5 ? "text-warning" : undefined}>{servings}</span>
                      )}
                    </TD>
                    )}
                    <TD>
                      {!m.isAvailable ? (
                        <Badge tone="outline">{ctx.branches.length > 1 ? "Hidden everywhere" : "Hidden"}</Badge>
                      ) : offHere ? (
                        <Badge tone="outline">Off at this branch</Badge>
                      ) : !branchId && offAt.length ? (
                        <span className="text-[12px] text-warning" title={offAt.map((b) => b.name).join(", ")}>
                          Off at {offAt.length === 1 ? offAt[0].name : `${offAt.length} branches`}
                        </span>
                      ) : (
                        <span className="text-[12px] text-muted">On menu</span>
                      )}
                    </TD>
                    <TD className="tabular whitespace-nowrap text-muted">{formatDateTime(m.updatedAt)}</TD>
                    <TD className="text-right">
                      <MenuRowActions
                        id={m.id}
                        name={m.name}
                        isAvailable={branchId ? m.isAvailable && !offHere : m.isAvailable}
                        scope={branchId ? (ctx.branches.length > 1 ? ctx.branch!.name : null) : ctx.branches.length > 1 ? "all branches" : null}
                        locked={Boolean(branchId) && !m.isAvailable && ctx.branches.length > 1}
                      />
                    </TD>
                  </TR>
                );
              })}
            </tbody>
          </Table>
        )}
      </Panel>
    </>
  );
}
