import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getGuestMenu } from "@/lib/services/menu";
import { listTables } from "@/lib/services/floor";
import { getGuestShop } from "@/lib/tenant";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Your order" };

export default async function CartPage({ params }: PageProps<"/s/[merchant]/[branch]/cart">) {
  await connection();
  const { merchant, branch } = await params;
  const shop = await getGuestShop(merchant, branch);
  if (!shop) notFound();
  const [menu, tables] = await Promise.all([getGuestMenu(shop.branch.id), listTables(shop.merchant.id)]);
  return <CartView items={menu.items} acceptingOrders={shop.settings.acceptingOrders} tables={tables} />;
}
