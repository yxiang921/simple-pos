"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  ArrowLeftRight,
  ChartNoAxesCombined,
  Box,
  Building2,
  ClipboardList,
  Database,
  LayoutGrid,
  Package,
  PackagePlus,
  ReceiptText,
  Settings,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon; badge?: boolean };

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: "Today",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutGrid },
      { href: "/admin/orders", label: "Orders", icon: ReceiptText, badge: true },
      { href: "/admin/floor", label: "Floor", icon: Box },
      { href: "/admin/prep", label: "Today's prep", icon: ClipboardList },
    ],
  },
  {
    title: "Catalog",
    items: [
      { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
      { href: "/admin/ingredients", label: "Inventory", icon: Package },
      { href: "/admin/inventory/stock-in", label: "Stock in", icon: PackagePlus },
      { href: "/admin/inventory/movements", label: "Stock movements", icon: ArrowLeftRight },
    ],
  },
  {
    title: "Business",
    items: [
      { href: "/admin/sales", label: "Sales", icon: ChartNoAxesCombined },
      { href: "/admin/costs", label: "Costs", icon: Wallet },
      { href: "/admin/branches", label: "Branches", icon: Building2 },
      { href: "/admin/settings", label: "Settings", icon: Settings },
      { href: "/admin/data-sources", label: "Data sources", icon: Database },
    ],
  },
];
const NAV = GROUPS.flatMap((g) => g.items);

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ pendingOrders }: { pendingOrders: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 overflow-y-auto px-2.5 pb-3" aria-label="Main">
      {GROUPS.map((g) => (
        <div key={g.title} className="mt-3 first:mt-1">
          <p className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-subtle">{g.title}</p>
          <div className="space-y-0.5">
            {g.items.map(({ href, label, icon: Icon, badge }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={clsx(
                    "press group relative flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[13.5px]",
                    active
                      ? "bg-primary font-medium text-white shadow-[0_6px_16px_-8px_var(--primary-glow),inset_0_1px_0_rgb(255_255_255/0.22)]"
                      : "text-ink hover:bg-hover",
                  )}
                >
                  <Icon
                    className={clsx(
                      "size-[17px] transition-transform duration-300 ease-[var(--ease-spring)] group-hover:scale-110",
                      active ? "text-white" : "text-primary",
                    )}
                    strokeWidth={1.9}
                  />
                  <span className="flex-1">{label}</span>
                  {badge && pendingOrders > 0 && (
                    <span
                      className={clsx(
                        "tabular min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold leading-[19px]",
                        active ? "bg-white/25 text-white" : "bg-primary text-white",
                      )}
                    >
                      {pendingOrders}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export function MobileNav({ pendingOrders }: { pendingOrders: number }) {
  const pathname = usePathname();
  return (
    <nav className="glass flex gap-1 overflow-x-auto border-b border-line px-3 py-2 [scrollbar-width:none] md:hidden" aria-label="Main">
      {NAV.map(({ href, label, badge }) => (
        <Link
          key={href}
          href={href}
          className={clsx(
            "press whitespace-nowrap rounded-full px-3 py-1.5 text-[13px]",
            isActive(pathname, href) ? "bg-primary font-medium text-white" : "text-ink hover:bg-hover",
          )}
        >
          {label}
          {badge && pendingOrders > 0 ? ` · ${pendingOrders}` : ""}
        </Link>
      ))}
    </nav>
  );
}
