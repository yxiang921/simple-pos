import { clsx } from "clsx";
import type { ComponentProps, ReactNode } from "react";

type Tone = "neutral" | "green" | "warning" | "danger" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-hover text-ink",
  green: "bg-primary-soft text-primary",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  outline: "border border-line-strong text-muted",
};

export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-[3px] px-1.5 text-[12px] font-medium",
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
  const c = { green: "bg-primary", warning: "bg-warning", danger: "bg-danger", muted: "bg-subtle" }[tone];
  return <span aria-hidden className={clsx("inline-block size-2 rounded-[2px]", c)} />;
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
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em] text-ink">{title}</h1>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={clsx("rounded-[6px] border border-line bg-surface", className)} {...props} />;
}

export function PanelHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex h-11 items-center justify-between gap-2 border-b border-line px-4">
      <h2 className="text-[14px] font-semibold">{title}</h2>
      {actions}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <p className="text-[14px] font-medium text-ink">{title}</p>
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
  return <thead className="border-b border-line bg-[#fafaf8]" {...props} />;
}

export function TH({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      className={clsx(
        "h-9 whitespace-nowrap px-3 text-[12px] font-medium uppercase tracking-[0.03em] text-muted first:pl-4 last:pr-4",
        className,
      )}
      {...props}
    />
  );
}

export function TR({ className, ...props }: ComponentProps<"tr">) {
  return <tr className={clsx("border-b border-line last:border-b-0 hover:bg-[#fbfbfa]", className)} {...props} />;
}

export function TD({ className, ...props }: ComponentProps<"td">) {
  return <td className={clsx("px-3 py-2.5 align-middle first:pl-4 last:pr-4", className)} {...props} />;
}
