/** Expected business-rule failures. Messages are safe to show to users. */
export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string = "DOMAIN_ERROR",
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export type StockShortage = {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  required: string;
  available: string;
  /** Names of cart menu items that use this ingredient. */
  affectedItems: string[];
};

export class InsufficientStockError extends DomainError {
  constructor(public readonly shortages: StockShortage[]) {
    const items = [...new Set(shortages.flatMap((s) => s.affectedItems))];
    super(
      items.length
        ? `Not enough stock to prepare: ${items.join(", ")}. Please reduce the quantity or remove the item.`
        : "Not enough stock to complete this order.",
      "INSUFFICIENT_STOCK",
    );
    this.name = "InsufficientStockError";
  }
}

export function isUniqueViolation(err: unknown, field?: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { code?: string; meta?: { target?: unknown; driverAdapterError?: unknown } };
  if (e.code !== "P2002") return false;
  if (!field) return true;
  return JSON.stringify(e.meta ?? {}).includes(field);
}

/** Result type returned by server actions to client forms. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
