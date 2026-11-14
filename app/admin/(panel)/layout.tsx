import { ArrowUpRight, LogOut } from "lucide-react";
import { clsx } from "clsx";
import { prisma } from "@/lib/db";
import { branchFilter, guestPath, requireContext } from "@/lib/tenant";
import { ToastProvider } from "@/components/ui/toast";
import { LiveIndicator, LiveUpdates } from "@/components/live-updates";
import { ThemeToggle } from "@/components/theme";
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
  const today = new Intl.DateTimeFormat("en-MY", { weekday: "short", day: "numeric", month: "short", timeZone: settings.timezone }).format(new Date());

  return (
    <ToastProvider>
      {/* Pushes database changes to every admin page (falls back to polling). */}
      <LiveUpdates url="/admin/events">
        <div className="flex min-h-dvh">
          {/* Floating, frosted macOS-style sidebar. */}
          <aside className="fixed inset-y-3 left-3 z-30 hidden w-[232px] flex-col overflow-hidden rounded-[22px] border border-line glass shadow-pop md:flex">
            <div className="flex items-center gap-3 px-4 pb-3 pt-4">
              <span className="relative flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-gradient-to-br from-[#e39a5f] via-primary to-[#9c4f17] text-[15px] font-bold text-white shadow-[0_6px_18px_-6px_var(--primary-glow),inset_0_1px_0_rgb(255_255_255/0.35)]">
                {storeName.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold leading-tight tracking-[-0.01em]">{storeName}</span>
                <span className="block truncate text-[11.5px] leading-tight text-muted">
                  {multi ? `${branches.length} branches` : "Single outlet"}
                </span>
              </span>
            </div>
            <SidebarNav pendingOrders={pending} />
            <div className="m-2 mt-0 rounded-[14px] border border-line bg-fill/60 p-2.5">
              <div className="flex items-center gap-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface text-[11px] font-semibold text-muted shadow-[0_1px_2px_rgb(0_0_0/0.08)] dark:bg-white/10">
                  {admin.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-medium leading-tight">{admin.name}</span>
                  <span className="block truncate text-[11px] leading-tight text-muted" title={admin.email}>
                    {admin.email}
                  </span>
                </span>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    title="Log out"
                    aria-label="Log out"
                    className="press flex size-7 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-ink"
                  >
                    <LogOut className="size-[15px]" />
                  </button>
                </form>
              </div>
              <ThemeToggle className="mt-2.5 w-full [&>button]:w-auto" />
            </div>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col md:pl-[256px]">
            <header className="sticky top-0 z-20 md:top-3 md:mr-3">
              <div className="glass flex h-14 items-center justify-between gap-3 border-b border-line px-4 md:h-[52px] md:rounded-[18px] md:border md:px-3 md:shadow-[var(--shadow-card)]">
                <div className="flex min-w-0 items-center gap-2.5 text-[13px] text-muted">
                  <span className="truncate font-semibold text-ink md:hidden">{storeName}</span>
                  <BranchSwitcher branches={switcherBranches} current={branch?.id ?? null} className="hidden sm:inline-flex" />
                  <span className="hidden whitespace-nowrap lg:inline">{today}</span>
                  <span
                    className={clsx(
                      "hidden h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium md:inline-flex",
                      settings.acceptingOrders ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
                    )}
                  >
                    <span className={clsx("size-1.5 rounded-full", settings.acceptingOrders ? "bg-success" : "bg-danger")} />
                    {settings.acceptingOrders ? "Accepting orders" : "Ordering paused"}
                  </span>
                  <LiveIndicator className="hidden sm:inline-flex" />
                </div>
                <div className="flex items-center gap-1.5">
                  <a
                    href={guestPath(merchant.slug, guestBranch.slug)}
                    target="_blank"
                    rel="noreferrer"
                    className="press group inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface/70 px-3 text-[13px] font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:border-line-strong dark:bg-white/[0.06]"
                  >
                    <span className="hidden sm:inline">Guest menu</span>
                    <span className="sm:hidden">Menu</span>
                    {multi && <span className="hidden font-normal text-muted xl:inline">· {guestBranch.name}</span>}
                    <ArrowUpRight className="size-3.5 text-muted transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" />
                  </a>
                  <span className="md:hidden">
                    <ThemeToggle />
                  </span>
                  <form action={logoutAction} className="md:hidden">
                    <button type="submit" aria-label="Log out" className="press flex size-8 items-center justify-center rounded-full hover:bg-hover">
                      <LogOut className="size-4" />
                    </button>
                  </form>
                </div>
              </div>
              {multi && (
                <div className="glass border-b border-line px-3 py-2 sm:hidden">
                  <BranchSwitcher branches={switcherBranches} current={branch?.id ?? null} className="w-full [&>select]:w-full [&>select]:max-w-none" />
                </div>
              )}
              <MobileNav pendingOrders={pending} />
            </header>
            <main className="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-10 pt-6 md:px-6 md:pr-7 md:pt-8">{children}</main>
          </div>
        </div>
      </LiveUpdates>
    </ToastProvider>
  );
}
