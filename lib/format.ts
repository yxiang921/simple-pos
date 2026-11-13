// Client-safe formatting helpers. Values arrive as strings (serialized Decimals);
// we only convert to Number for *display*, never for arithmetic.

export type BaseUnitCode = "PCS" | "G" | "ML";

export const BASE_UNIT_LABEL: Record<BaseUnitCode, string> = {
  PCS: "pcs",
  G: "g",
  ML: "ml",
};

/** Units an admin may type quantities in, and their factor to the base unit. */
export const INPUT_UNITS: Record<BaseUnitCode, { value: string; label: string; factor: string }[]> = {
  PCS: [{ value: "pcs", label: "pcs", factor: "1" }],
  G: [
    { value: "g", label: "g", factor: "1" },
    { value: "kg", label: "kg", factor: "1000" },
  ],
  ML: [
    { value: "ml", label: "ml", factor: "1" },
    { value: "L", label: "L", factor: "1000" },
  ],
};

const rmFormatter = new Intl.NumberFormat("en-MY", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatRM(value: string | number): string {
  return `RM ${rmFormatter.format(Number(value))}`;
}

const qtyFormatter = new Intl.NumberFormat("en-MY", { maximumFractionDigits: 3 });

export function formatQty(value: string | number, unit?: BaseUnitCode): string {
  const n = qtyFormatter.format(Number(value));
  return unit ? `${n} ${BASE_UNIT_LABEL[unit]}` : n;
}

/** "12,500 g" → secondary hint "12.5 kg" for large weight/volume values. */
export function formatQtyHint(value: string | number, unit: BaseUnitCode): string | null {
  const n = Number(value);
  if (unit === "PCS" || Math.abs(n) < 1000) return null;
  return `${qtyFormatter.format(n / 1000)} ${unit === "G" ? "kg" : "L"}`;
}

/** Convert a decimal money string ("12.90") to integer cents without floats. */
export function toCents(value: string): number {
  const [whole, frac = ""] = value.split(".");
  const sign = whole.startsWith("-") ? -1 : 1;
  const w = Math.abs(parseInt(whole, 10) || 0);
  const f = parseInt((frac + "00").slice(0, 2), 10) || 0;
  return sign * (w * 100 + f);
}

export function centsToString(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function formatOrderNumber(n: number): string {
  return `#${String(n).padStart(4, "0")}`;
}

const dateTimeFmt = new Intl.DateTimeFormat("en-MY", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kuala_Lumpur",
});

const timeFmt = new Intl.DateTimeFormat("en-MY", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Kuala_Lumpur",
});

export function formatDateTime(d: Date | string): string {
  return dateTimeFmt.format(new Date(d));
}

export function formatTime(d: Date | string): string {
  return timeFmt.format(new Date(d));
}

/** Unit used to show/enter costs: per kg, per L, or per piece. */
export const COST_UNIT: Record<BaseUnitCode, { value: "kg" | "L" | "pcs"; factor: number }> = {
  G: { value: "kg", factor: 1000 },
  ML: { value: "L", factor: 1000 },
  PCS: { value: "pcs", factor: 1 },
};

export const ORDER_STATUSES = ["PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"] as const;
export type OrderStatusCode = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABEL: Record<OrderStatusCode, string> = {
  PENDING: "Pending",
  PREPARING: "Preparing",
  READY: "Ready",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const MOVEMENT_TYPE_LABEL: Record<string, string> = {
  INITIAL: "Opening stock",
  RESTOCK: "Restock",
  ORDER_DEDUCTION: "Order deduction",
  ORDER_CANCELLATION: "Cancellation restore",
  ADJUSTMENT: "Adjustment",
};
