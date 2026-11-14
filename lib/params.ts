/**
 * Safe values from URL search params. Control characters (e.g. %00) are
 * removed: PostgreSQL rejects NUL bytes in text and the query would fail.
 */
export function textParam(v: string | string[] | undefined, max = 60): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max) : "";
}

/** An id-like param (cuid / uuid): letters, digits, dashes and underscores only. */
export function idParam(v: string | string[] | undefined): string {
  return typeof v === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : "";
}
