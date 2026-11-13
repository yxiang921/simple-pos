import Link from "next/link";
import { clsx } from "clsx";

export function MenuTabs({ active }: { active: "items" | "categories" }) {
  const tabs = [
    { key: "items", label: "Menu items", href: "/admin/menu" },
    { key: "categories", label: "Categories", href: "/admin/menu/categories" },
  ];
  return (
    <div className="mb-4 flex gap-5 border-b border-line">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={clsx(
            "-mb-px border-b-2 pb-2 text-[13px] font-medium",
            active === t.key ? "border-primary text-primary" : "border-transparent text-muted hover:text-ink",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
