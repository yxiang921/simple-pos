import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

type Tone = "neutral" | "green" | "brand" | "info" | "warning" | "danger" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-fill text-ink",
  green: "bg-success-soft text-success",
  brand: "bg-primary-soft text-primary",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  outline: "border border-line-strong text-muted",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[11.5px] font-semibold tracking-[0.01em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A small square status dot; used sparingly next to labels. */
export function Dot({ tone }: { tone: "green" | "warning" | "danger" | "muted" }) {
  const c = { green: "bg-success", warning: "bg-warning", danger: "bg-danger", muted: "bg-subtle" }[tone];
  return <span aria-hidden className={clsx("inline-block size-2 rounded-full", c)} />;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="animate-fade-up mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] font-bold leading-[1.15] tracking-[-0.028em] text-ink">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-[14px] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={clsx("card animate-fade-up overflow-hidden rounded-[18px]", className)} {...props} />;
}

export function PanelHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-12 items-center justify-between gap-2 border-b border-line px-5">
      <h2 className="text-[15px] font-semibold tracking-[-0.015em]">{title}</h2>
      {actions}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span aria-hidden className="mb-3 flex size-11 items-center justify-center rounded-2xl bg-primary-soft">
        <span className="size-3 rounded-full bg-primary shadow-[0_0_16px_var(--primary-glow)]" />
      </span>
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Table ─────────────────────────────────────────────────────────────

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx("w-full border-collapse text-left text-[13px]", className)} {...props} />
    </div>
  );
}

export function THead(props: ComponentProps<"thead">) {
  return <thead className="border-b border-line bg-surface-2/60 dark:bg-white/[0.02]" {...props} />;
}

export function TH({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={clsx(
        "h-10 whitespace-nowrap px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-subtle first:pl-5 last:pr-5",
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={clsx("border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-hover", className)} {...props} />;
}

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={clsx("px-3 py-3 align-middle first:pl-5 last:pr-5", className)} {...props} />;
}

// ─── Stat cards ────────────────────────────────────────────────────────

type StatTone = "brand" | "success" | "info" | "warning" | "danger";
const statIcon: Record<StatTone, string> = {
  brand: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success",
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export type Stat = {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  /** Colour the value (e.g. warning when low stock). */
  valueTone?: "warning" | "danger";
  href?: string;
};

/** Row of frosted stat cards with a pointer-following light. */
export function StatGrid({ stats, className }: { stats: Stat[]; className?: string }) {
  return (
    <div className={clsx("stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4", className)}>
      {stats.map((s) => {
        const body = (
          <>
            <div className="flex items-start justify-between gap-2">
              <p className="text-[12.5px] font-medium text-muted">{s.label}</p>
              {s.icon && (
                <span className={clsx("flex size-8 shrink-0 items-center justify-center rounded-[10px] [&_svg]:size-[17px]", statIcon[s.tone ?? "brand"])}>
                  {s.icon}
                </span>
              )}
            </div>
            <p
              className={clsx(
                "tabular mt-2 text-[28px] font-semibold leading-none tracking-[-0.03em]",
                s.valueTone === "warning" ? "text-warning" : s.valueTone === "danger" ? "text-danger" : "text-ink",
              )}
            >
              {s.value}
            </p>
            {s.sub && <p className="mt-2 text-[12px] text-muted">{s.sub}</p>}
          </>
        );
        const cls = "card spotlight lift block rounded-[18px] p-4";
        return s.href ? (
          <a key={s.label} href={s.href} className={clsx(cls, "hover:shadow-pop")}>
            {body}
          </a>
        ) : (
          <div key={s.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

/** Thin progress bar (share of sales etc.). */
export function Meter({ value, className }: { value: number; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <span className={clsx("relative inline-block h-1.5 overflow-hidden rounded-full bg-fill", className)}>
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-[#e8a46d] to-primary shadow-[0_0_8px_var(--primary-glow)] transition-[width] duration-700 ease-[var(--ease-out-soft)]"
        style={{ width: `${pct}%` }}
      />
    </span>
  );
}

// ─── Segmented control (macOS) ─────────────────────────────────────────

/** Container + item classes, usable for links (server) and buttons (client). */
export const segmentedClass = "inline-flex flex-wrap items-center gap-0.5 rounded-full border border-line bg-fill p-[3px]";
export function segmentClass(active: boolean) {
  return clsx(
    "press inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium transition-[background-color,color,box-shadow] duration-200",
    active
      ? "bg-surface text-ink shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.04)] dark:bg-white/[0.16]"
      : "text-muted hover:text-ink",
  );
}
