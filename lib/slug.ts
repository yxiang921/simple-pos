/** URL names for merchants and branches: lowercase letters, digits and dashes (2–40 chars). */
export const SLUG_RE = /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/;

/** Words that can't be used as a merchant URL name. */
export const RESERVED_SLUGS = new Set(["admin", "api", "s", "register", "login", "order", "events", "new", "www", "app", "static"]);

export function slugify(text: string, fallback = "shop"): string {
  const s = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return s || fallback;
}
