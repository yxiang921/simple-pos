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
      className="relative flex h-9 items-center gap-2 rounded-[4px] border border-line-strong px-3 text-[13px] font-medium hover:bg-hover"
      aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
    >
      <ShoppingBag className="size-4" />
      <span>Cart</span>
      {count > 0 && (
        <span className="tabular min-w-5 rounded-[3px] bg-primary px-1 text-center text-[12px] font-semibold leading-5 text-white">
          {count}
        </span>
      )}
    </Link>
  );
}
