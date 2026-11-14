import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getGuestMenu } from "@/lib/services/menu";
import { getGuestShop } from "@/lib/tenant";
import { MenuBrowser } from "./menu-browser";

export default async function GuestMenuPage({ params }: PageProps<"/s/[merchant]/[branch]">) {
  await connection();
  const { merchant, branch } = await params;
  const shop = await getGuestShop(merchant, branch);
  if (!shop) notFound();
  const menu = await getGuestMenu(shop.branch.id);

  if (menu.items.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-[15px] font-medium">The menu is being prepared</p>
        <p className="mt-1 text-[13px] text-muted">Please check back shortly or ask our staff for help.</p>
      </main>
    );
  }
  return <MenuBrowser menu={menu} acceptingOrders={shop.settings.acceptingOrders} />;
}
