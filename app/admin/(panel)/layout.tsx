import { ExternalLink } from "lucide-react";
import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { ToastProvider } from "@/components/ui/toast";
import { LiveIndicator, LiveUpdates } from "@/components/live-updates";
import { SidebarNav, MobileNav } from "./sidebar-nav";
import { logoutAction } from "../_actions/auth";

// Every admin page reads live data behind a session; never prerender at build time.
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const admin = await requireAdmin();
  const [settings, pending] = await Promise.all([
    prisma.storeSetting.findUnique({ where: { id: 1 } }),
    prisma.order.count({ where: { status: "PENDING" } }),
  ]);
  const storeName = settings?.storeName ?? "Restaurant POS";

  return (
    <ToastProvider>
      {/* Pushes database changes to every admin page (falls back to polling). */}
      <LiveUpdates url="/admin/events">
      <div className="flex min-h-dvh">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[216px] flex-col border-r border-line bg-surface md:flex">
          <div className="flex h-12 items-center gap-2 border-b border-line px-4">
            <span className="flex size-6 items-center justify-center rounded-[4px] bg-primary text-[12px] font-semibold text-white">
              {storeName.slice(0, 1)}
            </span>
            <span className="truncate text-[14px] font-semibold">{storeName}</span>
          </div>
          <SidebarNav pendingOrders={pending} />
          <div className="border-t border-line p-3">
            <p className="truncate px-2 text-[12px] text-muted" title={admin.email}>
              {admin.email}
            </p>
            <form action={logoutAction}>
              <button
                type="submit"
                className="mt-1 w-full rounded-[4px] px-2 py-1.5 text-left text-[13px] text-ink hover:bg-hover"
              >
                Log out
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col md:pl-[216px]">
          <header className="sticky top-0 z-20 flex h-12 items-center justify-between gap-3 border-b border-line bg-surface px-4 md:px-6">
            <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
              <span className="font-semibold text-ink md:hidden">{storeName}</span>
              <span className="hidden md:inline">
                {new Intl.DateTimeFormat("en-MY", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "Asia/Kuala_Lumpur",
                }).format(new Date())}
              </span>
              <span className="hidden md:inline">·</span>
              <span className={settings?.acceptingOrders === false ? "text-danger" : "text-primary"}>
                {settings?.acceptingOrders === false ? "Ordering paused" : "Accepting orders"}
              </span>
              <span className="hidden md:inline">·</span>
              <LiveIndicator />
            </div>
            <div className="flex items-center gap-1">
              <a
                href="/order"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-[4px] px-2.5 text-[13px] text-ink hover:bg-hover"
              >
                Guest menu <ExternalLink className="size-3.5" />
              </a>
              <form action={logoutAction} className="md:hidden">
                <button type="submit" className="h-8 rounded-[4px] px-2.5 text-[13px] hover:bg-hover">
                  Log out
                </button>
              </form>
            </div>
          </header>
          <MobileNav pendingOrders={pending} />
          <main className="flex-1 px-4 py-5 md:px-6">{children}</main>
        </div>
      </div>
      </LiveUpdates>
    </ToastProvider>
  );
}
