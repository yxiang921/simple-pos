"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { ArrowLeftRight, Box, ClipboardList, LayoutGrid, Package, ReceiptText, Settings, UtensilsCrossed, Wallet } from "lucide-react";

const NAV = [
  { href: "/admin/dashboard", label: "Dashboard", icon: LayoutGrid },
  { href: "/admin/orders", label: "Orders", icon: ReceiptText, badge: true },
  { href: "/admin/floor", label: "Floor", icon: Box },
  { href: "/admin/prep", label: "Today's prep", icon: ClipboardList },
  { href: "/admin/menu", label: "Menu", icon: UtensilsCrossed },
  { href: "/admin/ingredients", label: "Inventory", icon: Package },
  { href: "/admin/inventory/movements", label: "Stock movements", icon: ArrowLeftRight },
  { href: "/admin/costs", label: "Costs", icon: Wallet },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function SidebarNav({ pendingOrders }: { pendingOrders: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-px overflow-y-auto p-2" aria-label="Main">
      {NAV.map(({ href, label, icon: Icon, badge }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={clsx(
              "flex h-8 items-center gap-2.5 rounded-[4px] px-2 text-[13px]",
              active ? "bg-primary-soft font-medium text-primary" : "text-ink hover:bg-hover",
            )}
          >
            <Icon className={clsx("size-4", active ? "text-primary" : "text-muted")} />
            <span className="flex-1">{label}</span>
            {badge && pendingOrders > 0 && (
              <span className="tabular min-w-5 rounded-[3px] bg-primary px-1 text-center text-[11px] font-semibold leading-[18px] text-white">
                {pendingOrders}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ pendingOrders }: { pendingOrders: number }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line bg-surface px-3 py-1.5 md:hidden" aria-label="Main">
      {NAV.map(({ href, label, badge }) => (
        <Link
          key={href}
          href={href}
          className={clsx(
            "whitespace-nowrap rounded-[4px] px-2.5 py-1 text-[13px]",
            isActive(pathname, href) ? "bg-primary-soft font-medium text-primary" : "text-ink",
          )}
        >
          {label}
          {badge && pendingOrders > 0 ? ` (${pendingOrders})` : ""}
        </Link>
      ))}
    </nav>
  );
}
