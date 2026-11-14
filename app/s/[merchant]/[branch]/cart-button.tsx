"use client";

import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { useCart } from "./cart-store";
import { useShop } from "./shop-context";

export function CartButton() {
  const lines = useCart();
  const { base } = useShop();
  const count = lines.reduce((n, l) => n + l.quantity, 0);
  return (
    <Link
      href={`${base}/cart`}
      className="press relative flex h-9 items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 text-[13px] font-medium shadow-[0_1px_2px_rgb(0_0_0/0.05)] hover:border-line-strong dark:bg-white/[0.06]"
      aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
    >
      <ShoppingBag className="size-4" />
      <span>Cart</span>
      {count > 0 && (
        <span key={count} className="animate-pop tabular min-w-5 rounded-full bg-primary px-1.5 text-center text-[12px] font-semibold leading-5 text-white shadow-[0_2px_8px_-2px_var(--primary-glow)]">
          {count}
        </span>
      )}
    </Link>
  );
}
