"use client";

import { createContext, useContext, type ReactNode } from "react";

/** The branch a guest is ordering from: its URL base ("/s/kopico/hq") and id. */
export type Shop = { base: string; branchId: string };

const ShopContext = createContext<Shop>({ base: "/", branchId: "" });

export function ShopProvider({ value, children }: { value: Shop; children: ReactNode }) {
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  return useContext(ShopContext);
}

/** Guest details remembered on this device (name, and the table at a branch). */
export const GUEST_STORAGE = "pos.guest.v2";
export type GuestPrefs = { name?: string; table?: string; tableBranch?: string };

export function readGuestPrefs(): GuestPrefs {
  try {
    return JSON.parse(localStorage.getItem(GUEST_STORAGE) ?? "{}") as GuestPrefs;
  } catch {
    return {};
  }
}

export function saveGuestPrefs(update: GuestPrefs) {
  try {
    localStorage.setItem(GUEST_STORAGE, JSON.stringify({ ...readGuestPrefs(), ...update }));
  } catch {
    /* storage unavailable */
  }
}
