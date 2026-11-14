import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { prisma } from "@/lib/db";
import { CartButton } from "./cart-button";
import { GuestLiveUpdates } from "@/components/live-updates";

export const metadata: Metadata = { title: "Order" };

export default async function OrderLayout({ children }: LayoutProps<"/order">) {
  await connection(); // always render with live stock & settings
  const settings = await prisma.storeSetting.findUnique({ where: { id: 1 } });
  const storeName = settings?.storeName ?? "Our Café";

  return (
    <div className="min-h-dvh bg-surface sm:bg-bg">
      <GuestLiveUpdates />
      <header className="sticky top-0 z-30 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <Link href="/order" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-[4px] bg-primary text-[14px] font-semibold text-white">
              {storeName.slice(0, 1)}
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold">{storeName}</span>
              <span className="block text-[12px] text-muted">Order at your table</span>
            </span>
          </Link>
          <CartButton />
        </div>
      </header>
      {settings?.acceptingOrders === false && (
        <div className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-[13px] text-warning">
          We&apos;re not taking orders right now. You can still browse the menu.
        </div>
      )}
      {children}
    </div>
  );
}
