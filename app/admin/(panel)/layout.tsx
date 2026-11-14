import { ExternalLink } from "lucide-react";
import { clsx } from "clsx";
import { prisma } from "@/lib/db";
import { branchFilter, guestPath, requireContext } from "@/lib/tenant";
import { ToastProvider } from "@/components/ui/toast";
import { LiveIndicator, LiveUpdates } from "@/components/live-updates";
import { SidebarNav, MobileNav } from "./sidebar-nav";
import { BranchSwitcher } from "./branch-switcher";
import { logoutAction } from "../_actions/auth";

// Every admin page reads live data behind a session; never prerender at build time.
export const dynamic = "force-dynamic";

export default async function PanelLayout({ children }: LayoutProps<"/admin">) {
  const ctx = await requireContext();
  const { admin, settings, merchant, branches, branch } = ctx;
  const pending = await prisma.order.count({ where: { ...branchFilter(ctx), status: "PENDING", isSimulated: false } });
  const storeName = merchant.name;
  const guestBranch = branch ?? ctx.hq;
  const switcherBranches = branches.map(({ id, name, isHeadquarters, isActive }) => ({ id, name, isHeadquarters, isActive }));
  const multi = branches.length > 1;

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
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-semibold leading-tight">{storeName}</span>
              <span className="block truncate text-[11px] leading-tight text-muted">
                {multi ? `${branches.length} branches` : "Single outlet"}
              </span>
            </span>
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
              <BranchSwitcher branches={switcherBranches} current={branch?.id ?? null} className="hidden sm:inline-flex" />
              {multi && <span className="hidden sm:inline">·</span>}
              <span className="hidden lg:inline">
                {new Intl.DateTimeFormat("en-MY", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: settings.timezone,
                }).format(new Date())}
              </span>
              <span className="hidden lg:inline">·</span>
              <span className={clsx("hidden md:inline", settings.acceptingOrders ? "text-primary" : "text-danger")}>
                {settings.acceptingOrders ? "Accepting orders" : "Ordering paused"}
              </span>
              <span className="hidden md:inline">·</span>
              <LiveIndicator />
            </div>
            <div className="flex items-center gap-1">
              <a
                href={guestPath(merchant.slug, guestBranch.slug)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center gap-1.5 rounded-[4px] px-2.5 text-[13px] text-ink hover:bg-hover"
              >
                <span className="hidden sm:inline">Guest menu</span>
                <span className="sm:hidden">Menu</span>
                {multi && <span className="hidden text-muted xl:inline">· {guestBranch.name}</span>}
                <ExternalLink className="size-3.5" />
              </a>
              <form action={logoutAction} className="md:hidden">
                <button type="submit" className="h-8 rounded-[4px] px-2.5 text-[13px] hover:bg-hover">
                  Log out
                </button>
              </form>
            </div>
          </header>
          {multi && (
            <div className="border-b border-line bg-surface px-3 py-1.5 sm:hidden">
              <BranchSwitcher branches={switcherBranches} current={branch?.id ?? null} className="w-full [&>select]:w-full [&>select]:max-w-none" />
            </div>
          )}
          <MobileNav pendingOrders={pending} />
          <main className="flex-1 px-4 py-5 md:px-6">{children}</main>
        </div>
      </div>
      </LiveUpdates>
    </ToastProvider>
  );
}
