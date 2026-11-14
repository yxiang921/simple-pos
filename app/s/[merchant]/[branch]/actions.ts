"use server";

import { z } from "zod";
import { createOrder } from "@/lib/services/orders";
import { DomainError, InsufficientStockError } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createOrderSchema, fieldErrors, firstError, idString } from "@/lib/validation";

export type SubmitOrderResult =
  | { ok: true; orderId: string }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string[] | undefined>;
      /** Menu item names that could not be fulfilled from stock. */
      unavailableItems?: string[];
    };

/**
 * Guest checkout at one branch. The client sends only the branch id, menu item
 * ids + quantities and an idempotency key; prices, totals and stock are
 * resolved on the server (menu items must belong to the branch's merchant).
 */
export async function submitOrderAction(branchId: string, payload: unknown): Promise<SubmitOrderResult> {
  const branch = idString.safeParse(branchId);
  const parsed = createOrderSchema.safeParse(payload);
  if (!branch.success) return { ok: false, error: "Unknown outlet." };
  if (!parsed.success) {
    return { ok: false, error: firstError(parsed.error), fieldErrors: fieldErrors(parsed.error) };
  }

  const ip = await clientIp();
  const max = Number(process.env.ORDER_RATE_LIMIT_MAX ?? 10);
  const windowSec = Number(process.env.ORDER_RATE_LIMIT_WINDOW_SECONDS ?? 300);
  const limit = rateLimit(`order:${ip}`, max, windowSec * 1000);
  if (!limit.ok) {
    return { ok: false, error: `Too many orders from this device. Please wait ${limit.retryAfterSec}s or ask our staff.` };
  }

  try {
    const order = await createOrder(branch.data, parsed.data);
    return { ok: true, orderId: order.id };
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return {
        ok: false,
        error: err.message,
        unavailableItems: [...new Set(err.shortages.flatMap((s) => s.affectedItems))],
      };
    }
    if (err instanceof DomainError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: firstError(err) };
    console.error("[order] unexpected error", err);
    return { ok: false, error: "We couldn't place your order. Please try again." };
  }
}
