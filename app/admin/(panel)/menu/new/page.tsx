import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/misc";
import { MenuItemForm } from "../menu-item-form";
import { loadFormOptions } from "../form-data";

export const metadata: Metadata = { title: "New menu item" };

export default async function NewMenuItemPage() {
  const { categories, ingredients } = await loadFormOptions();
  return (
    <>
      <Link href="/admin/menu" className="mb-2 inline-flex items-center gap-1 text-[13px] text-muted hover:text-ink">
        <ChevronLeft className="size-4" /> Menu
      </Link>
      <PageHeader title="New menu item" />
      <MenuItemForm
        id={null}
        categories={categories}
        ingredients={ingredients}
        initial={{
          name: "",
          description: "",
          price: "",
          categoryId: categories[0]?.id ?? "",
          imageUrl: "",
          isAvailable: true,
          recipe: [],
        }}
      />
    </>
  );
}
