import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/ui/misc";
import { MenuTabs } from "../menu-tabs";
import { CategoryManager } from "./category-manager";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesPage() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { menuItems: { where: { isArchived: false } } } } },
  });
  return (
    <>
      <PageHeader title="Menu" description="Categories group items on the guest menu, in sort order." />
      <MenuTabs active="categories" />
      <CategoryManager
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          sortOrder: c.sortOrder,
          isActive: c.isActive,
          itemCount: c._count.menuItems,
        }))}
      />
    </>
  );
}
