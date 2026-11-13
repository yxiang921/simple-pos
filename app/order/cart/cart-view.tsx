"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import { clsx } from "clsx";
import { ChevronLeft, Loader2, Trash2 } from "lucide-react";
import type { GuestMenuItem } from "@/lib/services/menu";
import { centsToString, formatRM, toCents } from "@/lib/format";
import { Field, Input } from "@/components/ui/form";
import { cart, cartSignature, MAX_PER_ITEM, useCart } from "../cart-store";
import { ItemImage, Stepper } from "../menu-browser";
import { submitOrderAction } from "../actions";

const KEY_STORAGE = "pos.checkout.key.v1";
const NAME_STORAGE = "pos.guest.v1";

/**
 * One idempotency key per cart content. Retrying the same cart (e.g. after a
 * network error) reuses the key, so the server never creates a duplicate order.
 */
function getCheckoutKey(signature: string): string {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY_STORAGE) ?? "null") as { sig: string; key: string } | null;
    if (saved?.sig === signature) return saved.key;
    const key = crypto.randomUUID();
    sessionStorage.setItem(KEY_STORAGE, JSON.stringify({ sig: signature, key }));
    return key;
  } catch {
    return crypto.randomUUID();
  }
}

export function CartView({ items, acceptingOrders }: { items: GuestMenuItem[]; acceptingOrders: boolean }) {
  const router = useRouter();
  const lines = useCart();
  const live = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[] | undefined>>({});
  const [flagged, setFlagged] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  // true only in the browser after hydration (cart lives in localStorage).
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const rows = lines.map((l) => {
    const item = live.get(l.menuItemId);
    const max = item ? Math.min(MAX_PER_ITEM, item.maxServings ?? MAX_PER_ITEM) : 0;
    const price = item?.price ?? l.price;
    return {
      ...l,
      item,
      price,
      name: item?.name ?? l.name,
      unavailable: !item || max === 0,
      overLimit: !!item && max > 0 && l.quantity > max,
      max,
      subtotalCents: toCents(price) * l.quantity,
    };
  });
  const totalCents = rows.filter((r) => !r.unavailable).reduce((s, r) => s + r.subtotalCents, 0);
  const count = rows.reduce((n, r) => n + r.quantity, 0);
  const blocked = rows.some((r) => r.unavailable || r.overLimit);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("customerName") ?? "");
    const table = String(fd.get("tableNumber") ?? "");
    setError(null);
    setFieldErrors({});
    setFlagged([]);
    if (!name.trim()) {
      setFieldErrors({ customerName: ["Please enter your name"] });
      return;
    }
    const idempotencyKey = getCheckoutKey(cartSignature(lines) + `|${name.trim()}|${table.trim()}`);
    startTransition(async () => {
      let res;
      try {
        res = await submitOrderAction({
          customerName: name,
          tableNumber: table,
          idempotencyKey,
          items: lines.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
        });
      } catch {
        setError("Connection problem. Please check your network and tap Place order again — you won't be charged twice.");
        return;
      }
      if (res.ok) {
        try {
          localStorage.setItem(NAME_STORAGE, JSON.stringify({ name: name.trim(), table: table.trim() }));
          sessionStorage.removeItem(KEY_STORAGE);
        } catch {}
        cart.clear();
        router.replace(`/order/success/${res.orderId}`);
      } else {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        setFlagged(res.unavailableItems ?? []);
        router.refresh(); // pull fresh stock levels
      }
    });
  }

  if (hydrated && lines.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-[15px] font-medium">Your cart is empty</p>
        <p className="mt-1 text-[13px] text-muted">Browse the menu and add something you like.</p>
        <Link
          href="/order"
          className="mt-5 inline-flex h-11 items-center rounded-[4px] bg-primary px-5 text-[15px] font-semibold text-white hover:bg-primary-hover"
        >
          Browse menu
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl pb-32 sm:px-4 sm:pt-4">
      <div className="flex items-center justify-between px-4 py-3 sm:px-0">
        <Link href="/order" className="inline-flex items-center gap-1 text-[14px] text-muted hover:text-ink">
          <ChevronLeft className="size-4" /> Menu
        </Link>
        <h1 className="text-[17px] font-semibold">Your order</h1>
        <span className="w-14" />
      </div>

      <form onSubmit={submit} noValidate>
        <section className="border-y border-line bg-surface sm:rounded-[6px] sm:border">
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li
                key={r.menuItemId}
                className={clsx("flex gap-3 px-4 py-3", (r.unavailable || flagged.includes(r.name)) && "bg-danger-soft/50")}
              >
                <ItemImage item={{ name: r.name, imageUrl: r.item?.imageUrl ?? null }} className="size-14 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[15px] font-medium leading-snug">{r.name}</p>
                    <p className="tabular whitespace-nowrap text-[14px] font-semibold">
                      {r.unavailable ? "—" : formatRM(centsToString(r.subtotalCents))}
                    </p>
                  </div>
                  <p className="tabular text-[13px] text-muted">{formatRM(r.price)} each</p>
                  {r.unavailable ? (
                    <p className="mt-1 text-[13px] text-danger">No longer available — please remove.</p>
                  ) : r.overLimit ? (
                    <p className="mt-1 text-[13px] text-danger">Only {r.max} available — please reduce the quantity.</p>
                  ) : flagged.includes(r.name) ? (
                    <p className="mt-1 text-[13px] text-danger">Not enough stock for this quantity.</p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-3">
                    {!r.unavailable && (
                      <div className="w-28">
                        <Stepper
                          value={r.quantity}
                          max={r.max}
                          onChange={(n) => cart.setQuantity(r.menuItemId, n)}
                          label={r.name}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => cart.remove(r.menuItemId)}
                      className="inline-flex h-8 items-center gap-1 rounded-[4px] px-2 text-[13px] text-muted hover:bg-hover hover:text-danger"
                    >
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="space-y-1 border-t border-line px-4 py-3 text-[14px]">
            <div className="flex justify-between text-muted">
              <span>Items</span>
              <span className="tabular">{count}</span>
            </div>
            <div className="flex justify-between text-[16px] font-semibold">
              <span>Total</span>
              <span className="tabular">{formatRM(centsToString(totalCents))}</span>
            </div>
            <p className="text-[12px] text-muted">Pay at the counter. Final total is confirmed when your order is placed.</p>
          </div>
        </section>

        <section className="mt-3 border-y border-line bg-surface px-4 py-4 sm:rounded-[6px] sm:border">
          <h2 className="mb-3 text-[14px] font-semibold">Your details</h2>
          {hydrated && <GuestDetails fieldErrors={fieldErrors} />}
        </section>

        {error && (
          <div role="alert" className="mx-4 mt-3 rounded-[4px] border border-danger/30 bg-danger-soft px-3 py-2.5 text-[14px] text-danger sm:mx-0">
            {error}
          </div>
        )}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-3xl">
            <button
              type="submit"
              disabled={pending || blocked || !acceptingOrders || lines.length === 0}
              className="flex h-12 w-full items-center justify-between rounded-[4px] bg-primary px-4 text-[15px] font-semibold text-white hover:bg-primary-hover disabled:bg-[#9db3a8]"
            >
              <span className="flex items-center gap-2">
                {pending && <Loader2 className="size-4 animate-spin" />}
                {!acceptingOrders ? "Ordering paused" : blocked ? "Update your cart to continue" : pending ? "Placing order…" : "Place order"}
              </span>
              <span className="tabular">{formatRM(centsToString(totalCents))}</span>
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

function noopSubscribe() {
  return () => {};
}

/** Uncontrolled inputs, prefilled from the last order and from ?table= (QR codes). Client-only. */
function GuestDetails({ fieldErrors }: { fieldErrors: Record<string, string[] | undefined> }) {
  const [defaults] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(NAME_STORAGE) ?? "{}") as { name?: string; table?: string };
      const qrTable = new URLSearchParams(window.location.search).get("table");
      return { name: saved.name ?? "", table: qrTable ?? saved.table ?? "" };
    } catch {
      return { name: "", table: "" };
    }
  });
  return (
    <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
      <Field label="Name" htmlFor="customerName" error={fieldErrors.customerName}>
        <Input
          id="customerName"
          name="customerName"
          defaultValue={defaults.name}
          autoComplete="given-name"
          maxLength={60}
          placeholder="So we can call you"
          className="h-11 text-[16px]"
          aria-invalid={!!fieldErrors.customerName}
        />
      </Field>
      <Field label="Table no. (optional)" htmlFor="tableNumber" error={fieldErrors.tableNumber}>
        <Input
          id="tableNumber"
          name="tableNumber"
          defaultValue={defaults.table}
          maxLength={10}
          placeholder="e.g. 12"
          className="h-11 text-[16px]"
          aria-invalid={!!fieldErrors.tableNumber}
        />
      </Field>
    </div>
  );
}
