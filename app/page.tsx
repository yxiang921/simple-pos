import Link from "next/link";
import { connection } from "next/server";
import { ArrowRight, BarChart3, Box, Building2, ChefHat, Package, QrCode, Radio, Store } from "lucide-react";
import { prisma } from "@/lib/db";
import { PLATFORM_NAME } from "@/lib/platform";
import { guestUrl } from "@/lib/links";
import { sortBranches } from "@/lib/tenant";
import { BrandMark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme";
import { Reveal } from "@/components/reveal";

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
    <main className="min-h-dvh overflow-x-clip">
      {/* Frosted, sticky nav — like apple.com */}
      <header className="glass sticky top-0 z-40 border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <BrandMark size={28} />
            <span className="text-[15px] font-semibold tracking-[-0.01em]">{PLATFORM_NAME}</span>
          </Link>
          <nav className="flex items-center gap-1.5">
            <a href="#shops" className="hidden h-8 items-center rounded-full px-3 text-[13px] text-muted hover:text-ink sm:inline-flex">
              Order
            </a>
            <Link href="/admin/login" className="press inline-flex h-8 items-center rounded-full px-3 text-[13px] text-ink hover:bg-hover">
              Sign in
            </Link>
            <Link href="/register" className="press btn-primary inline-flex h-8 items-center rounded-full bg-primary px-3.5 text-[13px] font-medium text-white hover:bg-primary-hover">
              Get started
            </Link>
            <span className="ml-1 hidden sm:block">
              <ThemeToggle />
            </span>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="hero-light" aria-hidden />
        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-16 text-center sm:pt-24">
          <p className="animate-fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface/60 px-3 py-1 text-[12.5px] font-medium text-muted backdrop-blur">
            <span className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary-glow)]" />
            For cafés, kopitiams and restaurants with one or many outlets
          </p>
          <h1 className="animate-fade-up mx-auto mt-6 max-w-4xl text-[44px] font-bold leading-[1.04] tracking-[-0.045em] [animation-delay:0.05s] sm:text-[68px]">
            Every order. Every branch.
            <br />
            <span className="text-gradient">Perfectly in stock.</span>
          </h1>
          <p className="animate-fade-up mx-auto mt-6 max-w-2xl text-[18px] leading-relaxed text-muted [animation-delay:0.1s] sm:text-[20px]">
            Guests order from the table by QR code. Each order deducts the exact ingredients at the right outlet. You watch every branch, live, from
            one headquarters view.
          </p>
          <div className="animate-fade-up mt-9 flex flex-wrap items-center justify-center gap-3 [animation-delay:0.15s]">
            <Link
              href="/register"
              className="press btn-primary group inline-flex h-12 items-center gap-2 rounded-full bg-primary px-6 text-[16px] font-medium text-white hover:bg-primary-hover"
            >
              Register your business
              <ArrowRight className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <a href="#shops" className="press inline-flex h-12 items-center gap-1.5 rounded-full px-5 text-[16px] font-medium text-primary hover:bg-primary-soft">
              Try a guest menu <span aria-hidden>›</span>
            </a>
          </div>
        </div>

        {/* Product preview: floating frosted panels */}
        <Reveal className="relative mx-auto max-w-5xl px-5 pb-20">
          <HeroPreview />
        </Reveal>
      </section>

      {/* Bento features */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <Reveal>
          <h2 className="text-center text-[34px] font-bold tracking-[-0.035em] sm:text-[44px]">Everything the shop floor needs.</h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-[17px] text-muted">One menu for all branches. Separate orders and stock for each.</p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-6">
          <Feature className="md:col-span-4" delay={0} icon={<Building2 />} title="Headquarters overview" tone="brand">
            Sales, open orders and low stock of every branch side by side. Switch into any branch with one click.
          </Feature>
          <Feature className="md:col-span-2" delay={0.06} icon={<QrCode />} title="QR ordering" tone="info">
            A guest link for every outlet and table.
          </Feature>
          <Feature className="md:col-span-2" delay={0.1} icon={<Package />} title="Exact stock" tone="success">
            Recipes deduct ingredients automatically, never below zero.
          </Feature>
          <Feature className="md:col-span-2" delay={0.14} icon={<Box />} title="Live 3D floor" tone="warning">
            Tables turn from green to red as orders wait.
          </Feature>
          <Feature className="md:col-span-2" delay={0.18} icon={<Radio />} title="Real-time" tone="brand">
            Every screen updates within a second.
          </Feature>
          <Feature className="md:col-span-3" delay={0.22} icon={<ChefHat />} title="Daily prep & sold-out times" tone="success">
            Record plates prepared each morning; switching a dish off records when it sold out.
          </Feature>
          <Feature className="md:col-span-3" delay={0.26} icon={<BarChart3 />} title="Costs & profit" tone="info">
            Rent, utilities and salaries next to sales and ingredient cost — with a monthly profit estimate.
          </Feature>
        </div>
      </section>

      {/* Shops */}
      <section id="shops" className="scroll-mt-20 border-t border-line bg-surface/40 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal>
            <h2 className="text-[30px] font-bold tracking-[-0.03em]">Order from a shop</h2>
            <p className="mt-1.5 text-[15px] text-muted">Pick an outlet to open its guest menu.</p>
          </Reveal>
          {shops.length === 0 ? (
            <p className="card mt-8 rounded-[20px] px-5 py-8 text-center text-[14px] text-muted">No shops yet. Register the first one.</p>
          ) : (
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {shops.map((m, i) => (
                <Reveal key={m.slug} delay={i * 0.06}>
                  <div className="card spotlight lift h-full overflow-hidden rounded-[22px]">
                    <div className="flex items-center gap-3 px-5 pb-3 pt-5">
                      <span className="flex size-10 items-center justify-center rounded-[12px] bg-primary-soft text-primary">
                        <Store className="size-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[16px] font-semibold tracking-[-0.015em]">{m.name}</span>
                        <span className="block text-[12.5px] text-muted">
                          {m.branches.length} {m.branches.length === 1 ? "outlet" : "branches"}
                        </span>
                      </span>
                    </div>
                    <ul className="px-2 pb-2">
                      {sortBranches(m.branches).map((b) => (
                        <li key={b.slug}>
                          <Link
                            href={guestUrl(m.slug, b.slug)}
                            className="press group flex items-center justify-between gap-3 rounded-[14px] px-3 py-2.5 text-[13.5px] hover:bg-hover"
                          >
                            <span className="min-w-0">
                              <span className="block truncate font-medium">{b.name}</span>
                              {b.address && <span className="block truncate text-[12px] text-muted">{b.address}</span>}
                            </span>
                            <span className="flex shrink-0 items-center gap-1 text-[13px] font-medium text-primary">
                              Order <ArrowRight className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-[12px] text-muted">
          <span className="flex items-center gap-2">
            <BrandMark size={18} /> {PLATFORM_NAME}
          </span>
          <span className="sm:hidden">
            <ThemeToggle />
          </span>
          <span>Made for Malaysian F&amp;B · Prices in RM</span>
        </div>
      </footer>
    </main>
  );
}

const toneCls = {
  brand: "bg-primary-soft text-primary",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
} as const;

function Feature({
  icon,
  title,
  children,
  className,
  tone,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  className?: string;
  tone: keyof typeof toneCls;
  delay: number;
}) {
  return (
    <Reveal delay={delay} className={className}>
      <div className="card spotlight lift h-full rounded-[24px] p-6">
        <span className={`flex size-11 items-center justify-center rounded-[14px] [&_svg]:size-[22px] ${toneCls[tone]}`}>{icon}</span>
        <h3 className="mt-5 text-[19px] font-semibold tracking-[-0.02em]">{title}</h3>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">{children}</p>
      </div>
    </Reveal>
  );
}

/** Static illustration of the back office (no data): a dashboard window plus two floating cards. */
function HeroPreview() {
  const bars = [32, 48, 41, 66, 58, 82, 74, 95, 70, 62, 78, 54];
  return (
    <div className="relative">
      <div className="absolute inset-x-10 -bottom-6 h-24 rounded-full bg-primary/25 blur-3xl" aria-hidden />
      <div className="card shadow-pop relative overflow-hidden rounded-[26px]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
          <span className="ml-3 rounded-full bg-fill px-3 py-0.5 text-[11.5px] text-muted">Headquarters overview</span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-4">
          {[
            ["Orders today", "1,284"],
            ["Sales today", "RM 9,862"],
            ["Open orders", "17"],
            ["Low stock", "3"],
          ].map(([k, v], i) => (
            <div key={k} className="rounded-[16px] border border-line bg-surface/70 p-3.5 dark:bg-white/[0.04]">
              <p className="text-[11.5px] text-muted">{k}</p>
              <p className={`tabular mt-1.5 text-[22px] font-semibold tracking-[-0.03em] ${i === 3 ? "text-warning" : ""}`}>{v}</p>
            </div>
          ))}
          <div className="rounded-[16px] border border-line bg-surface/70 p-4 sm:col-span-3 dark:bg-white/[0.04]">
            <p className="text-[12px] font-medium text-muted">Sales by hour</p>
            <div className="mt-3 flex h-28 items-end gap-1.5">
              {bars.map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-[6px] bg-gradient-to-t from-primary/70 to-[#efb07b] shadow-[0_0_12px_-2px_var(--primary-glow)]"
                  style={{ height: `${h}%`, opacity: 0.55 + h / 250 }}
                />
              ))}
            </div>
          </div>
          <div className="space-y-2 rounded-[16px] border border-line bg-surface/70 p-4 dark:bg-white/[0.04]">
            <p className="text-[12px] font-medium text-muted">Branches</p>
            {[
              ["Headquarters", 46],
              ["Mount Austin", 32],
              ["Skudai", 22],
            ].map(([n, p]) => (
              <div key={n as string}>
                <div className="flex justify-between text-[12px]">
                  <span>{n}</span>
                  <span className="tabular text-muted">{p}%</span>
                </div>
                <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-fill">
                  <span className="block h-full rounded-full bg-gradient-to-r from-[#e8a46d] to-primary" style={{ width: `${p}%` }} />
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-strong shadow-pop float-slow absolute -left-16 top-36 hidden w-56 rounded-[20px] border border-line p-3.5 lg:block">
        <p className="text-[11.5px] font-medium text-muted">New order · Table 7</p>
        <p className="mt-1 text-[14px] font-semibold">2× Nasi Lemak Ayam</p>
        <p className="text-[12.5px] text-muted">1× Teh Tarik · RM 33.60</p>
        <span className="mt-2 inline-flex h-[22px] items-center rounded-full bg-warning-soft px-2.5 text-[11.5px] font-semibold text-warning">Pending · 2m</span>
      </div>
      <div className="glass-strong shadow-pop float-slower absolute -right-16 bottom-6 hidden w-52 rounded-[20px] border border-line p-3.5 lg:block">
        <p className="text-[11.5px] font-medium text-muted">Stock deducted</p>
        <ul className="mt-1.5 space-y-1 text-[12.5px]">
          <li className="flex justify-between">
            <span>Rice</span>
            <span className="tabular text-muted">−300 g</span>
          </li>
          <li className="flex justify-between">
            <span>Chicken thigh</span>
            <span className="tabular text-muted">−360 g</span>
          </li>
          <li className="flex justify-between">
            <span>Condensed milk</span>
            <span className="tabular text-muted">−30 ml</span>
          </li>
        </ul>
      </div>
    </div>
  );
}
