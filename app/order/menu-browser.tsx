"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { Minus, Plus } from "lucide-react";
import type { GuestMenu, GuestMenuItem } from "@/lib/services/menu";
import { centsToString, formatRM, toCents } from "@/lib/format";
import { Dialog } from "@/components/ui/dialog";
import { cart, MAX_PER_ITEM, useCart } from "./cart-store";

export function MenuBrowser({ menu, acceptingOrders }: { menu: GuestMenu; acceptingOrders: boolean }) {
  const lines = useCart();
  const qtyById = useMemo(() => new Map(lines.map((l) => [l.menuItemId, l.quantity])), [lines]);
  const [active, setActive] = useState(menu.categories[0]?.id);
  const [detail, setDetail] = useState<GuestMenuItem | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  const itemsByCat = useMemo(() => {
    const m = new Map<string, GuestMenuItem[]>();
    for (const i of menu.items) m.set(i.categoryId, [...(m.get(i.categoryId) ?? []), i]);
    return m;
  }, [menu.items]);

  // QR codes can point at the menu (/order?table=5): remember the table for checkout.
  useEffect(() => {
    const table = new URLSearchParams(window.location.search).get("table");
    if (!table) return;
    try {
      const saved = JSON.parse(localStorage.getItem("pos.guest.v1") ?? "{}");
      localStorage.setItem("pos.guest.v1", JSON.stringify({ ...saved, table }));
    } catch {
      /* storage unavailable */
    }
  }, []);

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
        className="sticky top-14 z-20 border-b border-line bg-surface"
        aria-label="Menu categories"
      >
        <div className="mx-auto flex max-w-3xl gap-1 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
          {menu.categories.map((c) => (
            <a
              key={c.id}
              data-cat={c.id}
              href={`#cat-${c.id}`}
              onClick={() => setActive(c.id)}
              className={clsx(
                "shrink-0 whitespace-nowrap rounded-[4px] px-3 py-1.5 text-[14px]",
                active === c.id ? "bg-primary font-medium text-white" : "text-ink hover:bg-hover",
              )}
            >
              {c.name}
            </a>
          ))}
        </div>
      </nav>

      <main className={clsx("mx-auto max-w-3xl pb-28 sm:px-4 sm:pt-4", count === 0 && "pb-10")}>
        {menu.categories.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-[112px] sm:mb-4 sm:rounded-[6px] sm:border sm:border-line sm:bg-surface">
            <h2 className="border-b border-line bg-[#fafaf8] px-4 py-2.5 text-[13px] font-semibold uppercase tracking-[0.04em] text-muted sm:rounded-t-[6px]">
              {c.name}
            </h2>
            <ul className="divide-y divide-line">
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
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-3xl">
            <Link
              href="/order/cart"
              className="flex h-12 items-center justify-between rounded-[4px] bg-primary px-4 text-[15px] font-semibold text-white hover:bg-primary-hover"
            >
              <span className="flex items-center gap-2">
                <span className="tabular flex h-6 min-w-6 items-center justify-center rounded-[3px] bg-white/15 px-1 text-[13px]">{count}</span>
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
  const limit = Math.min(MAX_PER_ITEM, item.maxServings ?? MAX_PER_ITEM);
  return (
    <li className={clsx("flex gap-3 px-4 py-3.5", out && "opacity-60")}>
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="text-[15px] font-medium leading-snug">{item.name}</p>
        {item.description && <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-muted">{item.description}</p>}
        <p className="tabular mt-1.5 text-[14px] font-semibold">{formatRM(item.price)}</p>
        {out ? (
          <p className="mt-0.5 text-[12px] font-medium text-danger">Sold out</p>
        ) : item.maxServings !== null && item.maxServings <= 5 ? (
          <p className="mt-0.5 text-[12px] text-warning">Only {item.maxServings} left</p>
        ) : null}
      </button>
      <div className="flex w-[92px] shrink-0 flex-col items-end gap-2">
        <button type="button" onClick={onOpen} className="block" aria-label={`View ${item.name}`} tabIndex={-1}>
          <ItemImage item={item} className="size-[92px]" />
        </button>
        {!out && acceptingOrders && (
          <div className="w-full">
            {qty === 0 ? (
              <button
                type="button"
                onClick={() => cart.add(item)}
                className="flex h-8 w-full items-center justify-center gap-1 rounded-[4px] border border-primary text-[13px] font-semibold text-primary hover:bg-primary-soft"
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
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.imageUrl} alt="" loading="lazy" className={clsx("rounded-[4px] border border-line bg-[#fafaf8] object-cover", className)} />;
  }
  return (
    <div
      aria-hidden
      className={clsx(
        "flex items-center justify-center rounded-[4px] border border-line bg-[#f3f3f0] text-[18px] font-semibold text-[#b5b5ae]",
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
    <div className={clsx("flex w-full items-stretch overflow-hidden rounded-[4px] border border-primary", h)}>
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        className="flex flex-1 items-center justify-center text-primary hover:bg-primary-soft"
        aria-label={`Decrease ${label}`}
      >
        <Minus className="size-3.5" />
      </button>
      <span className="tabular flex min-w-7 items-center justify-center bg-primary px-1 text-[13px] font-semibold text-white" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className="flex flex-1 items-center justify-center text-primary hover:bg-primary-soft disabled:opacity-40"
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
  const limit = Math.max(0, Math.min(MAX_PER_ITEM, item.maxServings ?? MAX_PER_ITEM) - inCart);
  const [qty, setQty] = useState(1);

  return (
    <Dialog open onClose={onClose} title={item.name} width="sm">
      <div className="space-y-4">
        {item.imageUrl && <ItemImage item={item} className="aspect-[4/3] w-full" />}
        {item.description && <p className="text-[14px] leading-relaxed text-muted">{item.description}</p>}
        <div className="flex items-baseline justify-between">
          <p className="tabular text-[18px] font-semibold">{formatRM(item.price)}</p>
          {inCart > 0 && <p className="text-[13px] text-muted">{inCart} already in cart</p>}
        </div>
        {out ? (
          <p className="rounded-[4px] bg-danger-soft px-3 py-2 text-[13px] text-danger">Sold out for now.</p>
        ) : !acceptingOrders ? (
          <p className="rounded-[4px] bg-warning-soft px-3 py-2 text-[13px] text-warning">Ordering is paused.</p>
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
              className="tabular flex h-11 flex-1 items-center justify-center rounded-[4px] bg-primary px-4 text-[15px] font-semibold text-white hover:bg-primary-hover"
            >
              Add · {formatRM(centsToString(toCents(item.price) * qty))}
            </button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
