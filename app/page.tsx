import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, Store } from "lucide-react";
import { prisma } from "@/lib/db";
import { PLATFORM_NAME } from "@/lib/platform";
import { guestUrl } from "@/lib/links";
import { sortBranches } from "@/lib/tenant";

/** Platform home: what the service is, sign-up / sign-in, and the shops taking orders. */
export default async function Home() {
  await connection();
  const merchants = await prisma.merchant.findMany({
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      slug: true,
      name: true,
      branches: { where: { isActive: true }, select: { slug: true, name: true, isHeadquarters: true, sortOrder: true, address: true } },
    },
  });
  const shops = merchants.filter((m) => m.branches.length > 0);

  return (
    <main className="min-h-dvh">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-[4px] bg-primary text-[13px] font-semibold text-white">
              {PLATFORM_NAME.slice(0, 1)}
            </span>
            <span className="text-[15px] font-semibold">{PLATFORM_NAME}</span>
          </span>
          <nav className="flex items-center gap-1">
            <Link href="/admin/login" className="inline-flex h-8 items-center rounded-[4px] px-3 text-[13px] hover:bg-hover">
              Owner sign in
            </Link>
            <Link href="/register" className="inline-flex h-8 items-center rounded-[4px] bg-primary px-3 text-[13px] font-medium text-white hover:bg-primary-hover">
              Register your business
            </Link>
          </nav>
        </div>
      </header>

      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-5xl gap-8 px-4 py-10 md:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight">Ordering, stock and branches for cafés and restaurants</h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted">
              Guests order from their table by QR code. Every order deducts ingredient stock at the right outlet. Owners see all branches from
              one headquarters view.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link href="/register" className="inline-flex h-10 items-center gap-1.5 rounded-[4px] bg-primary px-4 text-[14px] font-medium text-white hover:bg-primary-hover">
                Register your business <ArrowRight className="size-4" />
              </Link>
              <Link href="/admin/login" className="inline-flex h-10 items-center rounded-[4px] border border-line-strong bg-surface px-4 text-[14px] hover:bg-hover">
                Sign in
              </Link>
            </div>
          </div>
          <dl className="grid grid-cols-2 border-l border-t border-line text-[13px]">
            {[
              ["Shared menu", "One menu, recipes and ingredient list for every branch"],
              ["Per-branch stock", "Each outlet deducts and restocks its own ingredients"],
              ["HQ overview", "Sales, open orders and low stock of all branches"],
              ["Live", "Orders and the floor view update instantly"],
            ].map(([t, d]) => (
              <div key={t} className="border-b border-r border-line p-3">
                <dt className="font-semibold">{t}</dt>
                <dd className="mt-0.5 text-muted">{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8">
        <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted">Order from a shop</h2>
        {shops.length === 0 ? (
          <p className="rounded-[6px] border border-line bg-surface px-4 py-6 text-[13px] text-muted">No shops yet. Register the first one.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shops.map((m) => (
              <li key={m.slug} className="rounded-[6px] border border-line bg-surface">
                <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                  <Store className="size-4 text-muted" />
                  <span className="font-semibold">{m.name}</span>
                  <span className="ml-auto text-[12px] text-muted">
                    {m.branches.length} {m.branches.length === 1 ? "outlet" : "branches"}
                  </span>
                </div>
                <ul className="divide-y divide-line">
                  {sortBranches(m.branches).map((b) => (
                    <li key={b.slug}>
                      <Link href={guestUrl(m.slug, b.slug)} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px] hover:bg-hover">
                        <span className="min-w-0">
                          <span className="block truncate">{b.name}</span>
                          {b.address && <span className="block truncate text-[12px] text-muted">{b.address}</span>}
                        </span>
                        <span className="shrink-0 text-primary">Order →</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
