"use client";

import { useSyncExternalStore } from "react";

/**
 * Guest cart persisted in localStorage so it survives navigation and reloads.
 * Only ids + quantities matter to the server; name/price are display hints and
 * are re-read from the live menu on the cart page. The server recomputes all prices.
 */
export type CartLine = { menuItemId: string; quantity: number; name: string; price: string };

const KEY = "pos.cart.v1";
const EMPTY: CartLine[] = [];
let cache: CartLine[] | null = null;
const listeners = new Set<() => void>();

function read(): CartLine[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as CartLine[]) : [];
    cache = Array.isArray(parsed)
      ? parsed.filter((l) => typeof l?.menuItemId === "string" && Number.isInteger(l.quantity) && l.quantity > 0)
      : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(lines: CartLine[]) {
  cache = lines;
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable (private mode); keep in memory */
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
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

export const cart = {
  add(item: { id: string; name: string; price: string }, qty = 1) {
    const lines = read();
    const existing = lines.find((l) => l.menuItemId === item.id);
    if (existing) {
      write(lines.map((l) => (l.menuItemId === item.id ? { ...l, quantity: Math.min(MAX_PER_ITEM, l.quantity + qty) } : l)));
    } else {
      write([...lines, { menuItemId: item.id, quantity: Math.min(MAX_PER_ITEM, qty), name: item.name, price: item.price }]);
    }
  },
  setQuantity(menuItemId: string, quantity: number) {
    const q = Math.max(0, Math.min(MAX_PER_ITEM, Math.floor(quantity)));
    const lines = read();
    write(q === 0 ? lines.filter((l) => l.menuItemId !== menuItemId) : lines.map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: q } : l)));
  },
  remove(menuItemId: string) {
    write(read().filter((l) => l.menuItemId !== menuItemId));
  },
  clear() {
    write([]);
  },
};

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

/** Stable signature of cart contents, used to scope the idempotency key. */
export function cartSignature(lines: CartLine[]) {
  return lines
    .map((l) => `${l.menuItemId}:${l.quantity}`)
    .sort()
    .join("|");
}
