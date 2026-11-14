import Link from "next/link";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZES = [25, 50, 100] as const;

/** Read ?page= and ?size= safely. */
export function readPaging(sp: Record<string, string | string[] | undefined>, defaultSize = 25) {
  const size = PAGE_SIZES.find((s) => String(s) === sp.size) ?? defaultSize;
  const page = Math.max(1, Math.floor(Number(sp.page)) || 1);
  return { page, size };
}

/** Page numbers to show: 1 … 4 5 [6] 7 8 … 40 */
function pageList(page: number, pages: number): (number | "gap")[] {
  const set = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((p) => p >= 1 && p <= pages));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

/**
 * Server-rendered pagination: "Showing 26–50 of 47,056", numbered pages,
 * page size and jump-to-page. `href` builds the URL for a page / size,
 * keeping the page's other filters. `hidden` are the filters to keep in the jump form.
 */
export function Pagination({
  page,
  size,
  total,
  href,
  hidden,
  action,
  noun = "records",
}: {
  page: number;
  size: number;
  total: number;
  href: (p: { page?: number; size?: number }) => string;
  hidden: Record<string, string | undefined>;
  action: string;
  noun?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);
  const btn = "press inline-flex h-8 min-w-8 items-center justify-center rounded-full border px-2.5 text-[13px] tabular";

  return (
    <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
      <p className="tabular text-muted">
        {total === 0 ? `No ${noun}` : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} ${noun}`}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 text-muted">
          <span>Per page</span>
          {PAGE_SIZES.map((s) => (
            <Link
              key={s}
              href={href({ page: 1, size: s })}
              aria-current={s === size ? "true" : undefined}
              className={clsx(btn, s === size ? "border-primary/40 bg-primary-soft font-semibold text-primary" : "border-line bg-surface/70 text-ink hover:bg-hover dark:bg-white/[0.05]")}
            >
              {s}
            </Link>
          ))}
        </div>

        {pages > 1 && (
          <div className="flex items-center gap-1">
            {page > 1 ? (
              <Link href={href({ page: page - 1 })} className={clsx(btn, "border-line bg-surface/70 hover:bg-hover dark:bg-white/[0.05]")} aria-label="Previous page">
                <ChevronLeft className="size-4" />
              </Link>
            ) : (
              <span className={clsx(btn, "border-line text-subtle")} aria-hidden>
                <ChevronLeft className="size-4" />
              </span>
            )}
            {pageList(page, pages).map((p, i) =>
              p === "gap" ? (
                <span key={`gap-${i}`} className="px-1 text-subtle">
                  …
                </span>
              ) : (
                <Link
                  key={p}
                  href={href({ page: p })}
                  aria-current={p === page ? "page" : undefined}
                  className={clsx(btn, p === page ? "btn-primary border-primary bg-primary font-semibold text-white" : "border-line bg-surface/70 text-ink hover:bg-hover dark:bg-white/[0.05]")}
                >
                  {p.toLocaleString()}
                </Link>
              ),
            )}
            {page < pages ? (
              <Link href={href({ page: page + 1 })} className={clsx(btn, "border-line bg-surface/70 hover:bg-hover dark:bg-white/[0.05]")} aria-label="Next page">
                <ChevronRight className="size-4" />
              </Link>
            ) : (
              <span className={clsx(btn, "border-line text-subtle")} aria-hidden>
                <ChevronRight className="size-4" />
              </span>
            )}
          </div>
        )}

        {pages > 7 && (
          <form action={action} className="flex items-center gap-1">
            {Object.entries({ ...hidden, size: String(size) }).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
            <label htmlFor="jump-page" className="text-muted">
              Go to
            </label>
            <input
              id="jump-page"
              name="page"
              type="number"
              min={1}
              max={pages}
              placeholder={String(page)}
              className="h-8 w-20 rounded-full border border-line-strong bg-surface/80 px-3 text-[13px] tabular focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/20 dark:bg-white/[0.05]"
            />
          </form>
        )}
      </div>
    </nav>
  );
}
