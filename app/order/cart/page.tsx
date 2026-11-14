import type { Metadata } from "next";
import { connection } from "next/server";
import { getGuestMenu } from "@/lib/services/menu";
import { prisma } from "@/lib/db";
import { listTables } from "@/lib/services/floor";
import { CartView } from "./cart-view";

export const metadata: Metadata = { title: "Your order" };

export default async function CartPage() {
  await connection();
  const [menu, settings, tables] = await Promise.all([
    getGuestMenu(),
    prisma.storeSetting.findUnique({ where: { id: 1 } }),
    listTables(),
  ]);
  return <CartView items={menu.items} acceptingOrders={settings?.acceptingOrders ?? true} tables={tables} />;
}
