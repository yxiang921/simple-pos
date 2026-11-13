import { connection } from "next/server";
import { getGuestMenu } from "@/lib/services/menu";
import { prisma } from "@/lib/db";
import { MenuBrowser } from "./menu-browser";

export default async function GuestMenuPage() {
  await connection();
  const [menu, settings] = await Promise.all([getGuestMenu(), prisma.storeSetting.findUnique({ where: { id: 1 } })]);

  if (menu.items.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-[15px] font-medium">The menu is being prepared</p>
        <p className="mt-1 text-[13px] text-muted">Please check back shortly or ask our staff for help.</p>
      </main>
    );
  }
  return <MenuBrowser menu={menu} acceptingOrders={settings?.acceptingOrders ?? true} />;
}
