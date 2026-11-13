import type { Metadata } from "next";
import { Plus } from "lucide-react";
import type { Prisma } from "@/lib/generated/prisma/client";
import { prisma } from "@/lib/db";
import { computeMaxServings } from "@/lib/services/menu";
import { formatDateTime, formatRM } from "@/lib/format";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Badge, EmptyState, PageHeader, Panel, Table, TD, TH, THead, TR } from "@/components/ui/misc";
import { MenuTabs } from "./menu-tabs";
import { MenuRowActions } from "./menu-row-actions";
import { SavedToast } from "./saved-toast";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage({ searchParams }: PageProps<"/admin/menu">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const categoryId = typeof sp.category === "string" ? sp.category : "";

  const where: Prisma.MenuItemWhereInput = { isArchived: false };
  if (q) where.name = { contains: q, mode: "insensitive" };
  if (categoryId) where.categoryId = categoryId;

  const [items, categories] = await Promise.all([
    prisma.menuItem.findMany({
      where,
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      include: {
        category: { select: { name: true, isActive: true } },
        recipe: { include: { ingredient: { select: { currentStock: true, isActive: true } } } },
      },
    }),
    prisma.category.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);

  return (
    <>
      <SavedToast />
      <PageHeader
        title="Menu"
        description="Items, prices and the ingredient recipe used for stock deduction."
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
                <TH className="text-right">Can make</TH>
                <TH>Status</TH>
                <TH>Updated</TH>
                <TH className="text-right">Actions</TH>
              </tr>
            </THead>
            <tbody>
              {items.map((m) => {
                const servings = computeMaxServings(m.recipe);
                return (
                  <TR key={m.id}>
                    <TD>
                      <div className="flex items-center gap-3">
                        {m.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.imageUrl} alt="" className="size-9 shrink-0 rounded-[4px] border border-line object-cover" />
                        ) : (
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-[4px] border border-line bg-[#fafaf8] text-[12px] font-medium text-subtle">
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
                    <TD className="tabular text-right">
                      {servings === null ? (
                        <span className="text-muted">—</span>
                      ) : servings === 0 ? (
                        <Badge tone="danger">Sold out</Badge>
                      ) : (
                        <span className={servings <= 5 ? "text-warning" : undefined}>{servings}</span>
                      )}
                    </TD>
                    <TD>{m.isAvailable ? <span className="text-[12px] text-muted">On menu</span> : <Badge tone="outline">Hidden</Badge>}</TD>
                    <TD className="tabular whitespace-nowrap text-muted">{formatDateTime(m.updatedAt)}</TD>
                    <TD className="text-right">
                      <MenuRowActions id={m.id} name={m.name} isAvailable={m.isAvailable} />
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
