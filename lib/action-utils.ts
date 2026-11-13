import "server-only";
import { z } from "zod";
import { DomainError, InsufficientStockError, type ActionResult } from "@/lib/errors";
import { fieldErrors, firstError } from "@/lib/validation";

/**
 * Wrap server-action bodies: expected errors become a friendly ActionResult,
 * unexpected ones are logged and reported generically (no internals leaked).
 * Note: Next.js redirect()/notFound() throw special errors which must be re-thrown.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data } as ActionResult<T>;
  } catch (err) {
    if (isNextControlFlow(err)) throw err;
    if (err instanceof z.ZodError) {
      return { ok: false, error: firstError(err), fieldErrors: fieldErrors(err) };
    }
    if (err instanceof InsufficientStockError || err instanceof DomainError) {
      return { ok: false, error: err.message };
    }
    if (isNotFound(err)) return { ok: false, error: "Record not found. It may have been deleted." };
    console.error("[action] unexpected error", err);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

function isNextControlFlow(err: unknown) {
  const digest = (err as { digest?: unknown })?.digest;
  return typeof digest === "string" && (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_HTTP_ERROR_FALLBACK") || digest === "NEXT_NOT_FOUND");
}

function isNotFound(err: unknown) {
  return (err as { code?: string })?.code === "P2025";
}

/** Read FormData into a plain object (single values only). */
export function formObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") out[k] = v;
  return out;
}
