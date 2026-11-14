import Link from "next/link";
import { segmentClass, segmentedClass } from "@/components/ui/misc";

export function MenuTabs({ active }: { active: "items" | "categories" }) {
  const tabs = [
    { key: "items", label: "Menu items", href: "/admin/menu" },
    { key: "categories", label: "Categories", href: "/admin/menu/categories" },
  ];
  return (
    <div className={`${segmentedClass} mb-4`}>
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} className={segmentClass(active === t.key)}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}
