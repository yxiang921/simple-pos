"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Minus, Plus } from "lucide-react";
import type { GuestMenu, GuestMenuItem } from "@/lib/services/menu";
import { centsToString, formatRM, toCents } from "@/lib/format";
import { Dialog } from "@/components/ui/dialog";
import { MAX_PER_ITEM, useCart, useCartActions } from "./cart-store";
import { photoCredit } from "@/lib/menu-photos";
import { saveGuestPrefs, useShop } from "./shop-context";

export function MenuBrowser({ menu, acceptingOrders }: { menu: GuestMenu; acceptingOrders: boolean }) {
  const lines = useCart();
  const { base, branchId } = useShop();
  const qtyById = useMemo(() => new Map(lines.map((l) => [l.menuItemId, l.quantity])), [lines]);
  const [active, setActive] = useState(menu.categories[0]?.id);
  const [detail, setDetail] = useState<GuestMenuItem | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const itemsByCat = useMemo(() => {
    const m = new Map<string, GuestMenuItem[]>();
    for (const i of menu.items) m.set(i.categoryId, [...(m.get(i.categoryId) ?? []), i]);
    return m;
  }, [menu.items]);

  // QR codes can point at the menu (/s/shop/branch?table=5): remember the table for checkout.
  useEffect(() => {
    const table = new URLSearchParams(window.location.search).get("table");
    if (table) saveGuestPrefs({ table, tableBranch: branchId });
  }, [branchId]);

  // Highlight the category currently in view.
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace("cat-", ""));
      },
      { rootMargin: "-120px 0px -60% 0px" },
    );
    menu.categories.forEach((c) => {
      const el = document.getElementById(`cat-${c.id}`);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [menu.categories]);

  // Keep the active tab scrolled into view on small screens.
  useEffect(() => {
    tabsRef.current?.querySelector<HTMLElement>(`[data-cat="${active}"]`)?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active]);

  const count = lines.reduce((n, l) => n + l.quantity, 0);
  const totalCents = lines.reduce((s, l) => {
    const live = menu.items.find((i) => i.id === l.menuItemId);
    return s + toCents(live?.price ?? l.price) * l.quantity;
  }, 0);

  return (
    <>
      <nav
        ref={tabsRef}
        className="glass sticky top-14 z-20 border-b border-line"
        aria-label="Menu categories"
      >
        <div className="mx-auto flex max-w-3xl gap-1.5 overflow-x-auto px-3 py-2.5 [scrollbar-width:none]">
          {menu.categories.map((c) => (
            <a
              key={c.id}
              data-cat={c.id}
              href={`#cat-${c.id}`}
              onClick={() => setActive(c.id)}
              className={clsx(
                "press shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14px] transition-[background-color,color,box-shadow] duration-300",
                active === c.id
                  ? "bg-primary font-medium text-white shadow-[0_6px_16px_-8px_var(--primary-glow)]"
                  : "bg-fill/70 text-ink hover:bg-hover",
              )}
            >
              {c.name}
            </a>
          ))}
        </div>
      </nav>

      <main className={clsx("mx-auto max-w-3xl px-3 pb-32 pt-4 sm:px-4", count === 0 && "pb-12")}>
        {menu.categories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="animate-fade-up mb-6 scroll-mt-[124px]">
            <h2 className="px-1 pb-2.5 text-[22px] font-bold tracking-[-0.025em]">
              {c.name}
            </h2>
            <ul className="card divide-y divide-line overflow-hidden rounded-[22px]">
              {(itemsByCat.get(c.id) ?? []).map((item) => (
                <MenuRow
                  key={item.id}
                  item={item}
                  qty={qtyById.get(item.id) ?? 0}
                  acceptingOrders={acceptingOrders}
                  onOpen={() => setDetail(item)}
                />
              ))}
            </ul>
          </section>
        ))}
      </main>

      {count > 0 && (
        <div className="animate-fade-up pointer-events-none fixed inset-x-0 bottom-0 z-30 p-3 pb-[max(0.9rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto mx-auto max-w-3xl">
            <Link
              href={`${base}/cart`}
              className="press btn-primary flex h-14 items-center justify-between rounded-full bg-primary pl-2.5 pr-5 text-[16px] font-semibold text-white shadow-[0_18px_40px_-14px_var(--primary-glow)] hover:bg-primary-hover"
            >
              <span className="flex items-center gap-2">
                <span key={count} className="animate-pop tabular flex size-9 items-center justify-center rounded-full bg-white/20 text-[14px]">{count}</span>
                View cart
              </span>
              <span className="tabular">{formatRM(centsToString(totalCents))}</span>
            </Link>
          </div>
        </div>
      )}

      {detail && (
        <ItemDialog
          item={detail}
          inCart={qtyById.get(detail.id) ?? 0}
          acceptingOrders={acceptingOrders}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}

function soldOut(item: GuestMenuItem) {
  return item.maxServings === 0;
}

function MenuRow({
  item,
  qty,
  acceptingOrders,
  onOpen,
}: {
  item: GuestMenuItem;
  qty: number;
  acceptingOrders: boolean;
  onOpen: () => void;
}) {
  const out = soldOut(item);
  const cart = useCartActions();
  const limit = Math.min(MAX_PER_ITEM, item.maxServings ?? MAX_PER_ITEM);
  return (
    <li className={clsx("flex gap-4 px-4 py-4 transition-colors duration-200 hover:bg-hover/60", out && "opacity-55")}>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="text-[16px] font-semibold leading-snug tracking-[-0.015em]">{item.name}</p>
        {item.description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{item.description}</p>}
        <p className="tabular mt-2 text-[15px] font-semibold text-primary">{formatRM(item.price)}</p>
        {out ? (
          <span className="mt-1.5 inline-flex h-[22px] items-center rounded-full bg-danger-soft px-2.5 text-[11.5px] font-semibold text-danger">Sold out</span>
        ) : item.maxServings !== null && item.maxServings <= 5 ? (
          <span className="mt-1.5 inline-flex h-[22px] items-center rounded-full bg-warning-soft px-2.5 text-[11.5px] font-semibold text-warning">Only {item.maxServings} left</span>
        ) : null}
      </button>
      <div className="relative w-[104px] shrink-0">
        <button type="button" onClick={onOpen} className="block" aria-label={`View ${item.name}`} tabIndex={-1}>
          <ItemImage item={item} className="size-[104px]" />
        </button>
        {!out && acceptingOrders && (
          <div className="absolute -bottom-2 left-1/2 w-[88px] -translate-x-1/2">
            {qty === 0 ? (
              <button
                type="button"
                onClick={() => cart.add(item)}
                className="press glass-strong flex h-8 w-full items-center justify-center gap-1 rounded-full border border-line text-[13px] font-semibold text-primary shadow-[0_6px_16px_-8px_rgb(0_0_0/0.35)] hover:border-primary/40"
              >
                <Plus className="size-3.5" /> Add
              </button>
            ) : (
              <Stepper
                value={qty}
                max={limit}
                onChange={(n) => cart.setQuantity(item.id, n)}
                label={item.name}
              />
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export function ItemImage({ item, className }: { item: { name: string; imageUrl: string | null }; className?: string }) {
  if (item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.imageUrl}
        alt=""
        loading="lazy"
        className={clsx("rounded-[18px] border border-line bg-fill object-cover shadow-[0_8px_20px_-12px_rgb(0_0_0/0.4)]", className)}
      />
    );
  }
  return (
    <div
      aria-hidden
      className={clsx(
        "relative flex items-center justify-center overflow-hidden rounded-[18px] bg-gradient-to-br from-[#f6d6b8] via-[#eab68a] to-[#cc7736] text-[22px] font-bold tracking-[-0.02em] text-white/95 shadow-[0_10px_24px_-14px_var(--primary-glow),inset_0_1px_0_rgb(255_255_255/0.45)]",
        "dark:from-[#6b4024] dark:via-[#94572a] dark:to-[#cc7736]",
        className,
      )}
    >
      {item.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase()}
    </div>
  );
}

export function Stepper({
  value,
  max,
  onChange,
  label,
  size = "sm",
}: {
  value: number;
  max: number;
  onChange: (n: number) => void;
  label: string;
  size?: "sm" | "lg";
}) {
  const h = size === "lg" ? "h-11" : "h-8";
  return (
    <div className={clsx("glass-strong flex w-full items-stretch overflow-hidden rounded-full border border-primary/40 shadow-[0_6px_16px_-8px_rgb(0_0_0/0.35)]", h)}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        className="press flex flex-1 items-center justify-center text-primary hover:bg-primary-soft"
        aria-label={`Decrease ${label}`}
      >
        <Minus className="size-3.5" />
      </button>
      <span key={value} className="animate-pop tabular flex min-w-7 items-center justify-center px-1 text-[14px] font-semibold text-ink" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className="press flex flex-1 items-center justify-center text-primary hover:bg-primary-soft disabled:opacity-40"
        aria-label={`Increase ${label}`}
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function ItemDialog({
  item,
  inCart,
  acceptingOrders,
  onClose,
}: {
  item: GuestMenuItem;
  inCart: number;
  acceptingOrders: boolean;
  onClose: () => void;
}) {
  const out = soldOut(item);
  const cart = useCartActions();
  const limit = Math.max(0, Math.min(MAX_PER_ITEM, item.maxServings ?? MAX_PER_ITEM) - inCart);
  const [qty, setQty] = useState(1);

  return (
    <Dialog open onClose={onClose} title={item.name} width="sm">
      <div className="space-y-4">
        {item.imageUrl && (
          <figure>
            <ItemImage item={item} className="aspect-[4/3] w-full" />
            <PhotoCredit url={item.imageUrl} />
          </figure>
        )}
        {item.description && <p className="text-[14px] leading-relaxed text-muted">{item.description}</p>}
        <div className="flex items-baseline justify-between">
          <p className="tabular text-[18px] font-semibold">{formatRM(item.price)}</p>
          {inCart > 0 && <p className="text-[13px] text-muted">{inCart} already in cart</p>}
        </div>
        {out ? (
          <p className="rounded-[12px] bg-danger-soft px-3 py-2 text-[13px] text-danger">Sold out for now.</p>
        ) : !acceptingOrders ? (
          <p className="rounded-[12px] bg-warning-soft px-3 py-2 text-[13px] text-warning">Ordering is paused.</p>
        ) : limit === 0 ? (
          <p className="text-[13px] text-warning">You have the maximum available in your cart.</p>
        ) : (
          <div className="flex gap-3">
            <div className="w-32">
              <Stepper value={qty} max={limit} onChange={(n) => setQty(Math.max(1, n))} label={item.name} size="lg" />
            </div>
            <button
              type="button"
              onClick={() => {
                cart.add(item, qty);
                onClose();
              }}
              className="press btn-primary tabular flex h-11 flex-1 items-center justify-center rounded-full bg-primary px-4 text-[15px] font-semibold text-white hover:bg-primary-hover"
            >
              Add · {formatRM(centsToString(toCents(item.price) * qty))}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}

/** "Photo: author · licence" for the free sample photos (required attribution). */
function PhotoCredit({ url }: { url: string }) {
  const c = photoCredit(url);
  if (!c) return null;
  return (
    <figcaption className="mt-1.5 text-right text-[11px] text-subtle">
      Photo:{" "}
      <a href={c.page} target="_blank" rel="noreferrer" className="hover:underline">
        {c.author}
      </a>{" "}
      ·{" "}
      <a href={c.licenseUrl} target="_blank" rel="noreferrer" className="hover:underline">
        {c.license}
      </a>
    </figcaption>
  );
}
