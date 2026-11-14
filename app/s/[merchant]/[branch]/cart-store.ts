"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useShop } from "./shop-context";

/**
 * Guest cart persisted in localStorage (one cart per branch) so it survives
 * navigation and reloads. Only ids + quantities matter to the server;
 * name/price are display hints and are re-read from the live menu on the cart
 * page. The server recomputes all prices.
 */
export type CartLine = { menuItemId: string; quantity: number; name: string; price: string };

const PREFIX = "pos.cart.v2.";
const EMPTY: CartLine[] = [];
const caches = new Map<string, CartLine[]>();
const listeners = new Set<() => void>();

function read(key: string): CartLine[] {
  const cached = caches.get(key);
  if (cached) return cached;
  let lines: CartLine[] = [];
  try {
    const raw = localStorage.getItem(PREFIX + key);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    lines = Array.isArray(parsed)
      ? parsed.filter((l) => typeof l?.menuItemId === "string" && Number.isInteger(l.quantity) && l.quantity > 0)
      : [];
  } catch {
    lines = [];
  }
  caches.set(key, lines);
  return lines;
}

function write(key: string, lines: CartLine[]) {
  caches.set(key, lines);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(lines));
  } catch {
    /* storage unavailable (private mode); keep in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(PREFIX)) {
      caches.delete(e.key.slice(PREFIX.length));
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export const MAX_PER_ITEM = 50;

function cartFor(key: string) {
  return {
    add(item: { id: string; name: string; price: string }, qty = 1) {
      const lines = read(key);
      const existing = lines.find((l) => l.menuItemId === item.id);
      if (existing) {
        write(key, lines.map((l) => (l.menuItemId === item.id ? { ...l, quantity: Math.min(MAX_PER_ITEM, l.quantity + qty) } : l)));
      } else {
        write(key, [...lines, { menuItemId: item.id, quantity: Math.min(MAX_PER_ITEM, qty), name: item.name, price: item.price }]);
      }
    },
    setQuantity(menuItemId: string, quantity: number) {
      const q = Math.max(0, Math.min(MAX_PER_ITEM, Math.floor(quantity)));
      const lines = read(key);
      write(key, q === 0 ? lines.filter((l) => l.menuItemId !== menuItemId) : lines.map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: q } : l)));
    },
    remove(menuItemId: string) {
      write(key, read(key).filter((l) => l.menuItemId !== menuItemId));
    },
    clear() {
      write(key, []);
    },
  };
}

/** Cart actions for the branch the guest is ordering from. */
export function useCartActions() {
  const { branchId } = useShop();
  return useMemo(() => cartFor(branchId), [branchId]);
}

export function useCart(): CartLine[] {
  const { branchId } = useShop();
  return useSyncExternalStore(subscribe, () => read(branchId), () => EMPTY);
}

/** Stable signature of cart contents, used to scope the idempotency key. */
export function cartSignature(lines: CartLine[]) {
  return lines
    .map((l) => `${l.menuItemId}:${l.quantity}`)
    .sort()
    .join("|");
}
