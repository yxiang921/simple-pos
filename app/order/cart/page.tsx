import type { Metadata } from "next";
import { connection } from "next/server";
import { getGuestMenu } from "@/lib/services/menu";
import { prisma } from "@/lib/db";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Your order" };

export default async function CartPage() {
  await connection();
  const [menu, settings] = await Promise.all([getGuestMenu(), prisma.storeSetting.findUnique({ where: { id: 1 } })]);
  return <CartView items={menu.items} acceptingOrders={settings?.acceptingOrders ?? true} />;
}
