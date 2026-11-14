import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getGuestShop, guestPath } from "@/lib/tenant";
import { CartButton } from "./cart-button";
import { ShopProvider } from "./shop-context";
import { GuestLiveUpdates } from "@/components/live-updates";

export async function generateMetadata({ params }: LayoutProps<"/s/[merchant]/[branch]">): Promise<Metadata> {
  const { merchant, branch } = await params;
  const shop = await getGuestShop(merchant, branch);
  if (!shop) return { title: "Not found" };
  const multi = shop.branch.slug !== "hq" || !shop.branch.isHeadquarters;
  return { title: { default: `Order · ${shop.merchant.name}${multi ? ` ${shop.branch.name}` : ""}`, template: `%s · ${shop.merchant.name}` } };
}

export default async function ShopLayout({ children, params }: LayoutProps<"/s/[merchant]/[branch]">) {
  await connection(); // always render with live stock & settings
  const { merchant, branch } = await params;
  const shop = await getGuestShop(merchant, branch);
  if (!shop) notFound();
  const base = guestPath(shop.merchant.slug, shop.branch.slug);
  const storeName = shop.settings.storeName || shop.merchant.name;

  return (
    <ShopProvider value={{ base, branchId: shop.branch.id }}>
      <div className="min-h-dvh bg-surface sm:bg-bg">
        <GuestLiveUpdates base={base} />
        <header className="sticky top-0 z-30 border-b border-line bg-surface">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
            <Link href={base} className="flex min-w-0 items-center gap-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-[4px] bg-primary text-[14px] font-semibold text-white">
                {storeName.slice(0, 1)}
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[15px] font-semibold">{storeName}</span>
                <span className="block truncate text-[12px] text-muted">{shop.branch.name} · Order at your table</span>
              </span>
            </Link>
            <CartButton />
          </div>
        </header>
        {!shop.settings.acceptingOrders && (
          <div className="border-b border-warning/30 bg-warning-soft px-4 py-2 text-center text-[13px] text-warning">
            We&apos;re not taking orders right now. You can still browse the menu.
          </div>
        )}
        {children}
      </div>
    </ShopProvider>
  );
}
