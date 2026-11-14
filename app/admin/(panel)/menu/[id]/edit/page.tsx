import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { BASE_UNIT_LABEL, formatDateTime, type BaseUnitCode } from "@/lib/format";
import { PageHeader } from "@/components/ui/misc";
import { MenuItemForm } from "../../menu-item-form";
import { loadFormOptions } from "../../form-data";
import { requireContext } from "@/lib/tenant";

export const metadata: Metadata = { title: "Edit menu item" };

export default async function EditMenuItemPage({ params }: PageProps<"/admin/menu/[id]/edit">) {
  const { id } = await params;
  const ctx = await requireContext();
  const [item, options] = await Promise.all([
    prisma.menuItem.findFirst({
      where: { id, merchantId: ctx.merchant.id },
      include: { recipe: { include: { ingredient: { select: { unit: true, name: true } } }, orderBy: { ingredient: { name: "asc" } } } },
    }),
    loadFormOptions(ctx),
  ]);
  if (!item || item.isArchived) notFound();

  return (
    <>
      <Link href="/admin/menu" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Menu
      </Link>
      <PageHeader title={`Edit ${item.name}`} description={`Last updated ${formatDateTime(item.updatedAt)}`} />
      <MenuItemForm
        id={item.id}
        categories={options.categories}
        ingredients={options.ingredients}
        stockLabel={options.stockLabel}
        initial={{
          name: item.name,
          description: item.description,
          price: item.price.toFixed(2),
          categoryId: item.categoryId,
          imageUrl: item.imageUrl ?? "",
          isAvailable: item.isAvailable,
          isPreparedAhead: item.isPreparedAhead === null ? "" : item.isPreparedAhead ? "yes" : "no",
          aliases: item.aliases.join(", "),
          recipe: item.recipe.map((r) => ({
            ingredientId: r.ingredientId,
            quantity: r.quantityRequired.toString(),
            inputUnit: BASE_UNIT_LABEL[r.ingredient.unit as BaseUnitCode],
          })),
        }}
      />
    </>
  );
}
