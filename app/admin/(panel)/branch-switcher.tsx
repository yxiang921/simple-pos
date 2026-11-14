"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Building2, Check, ChevronRight, ChevronsUpDown, Layers, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/ui/toast";
import { switchBranchAction } from "../_actions/branches";

export type SwitcherBranch = { id: string; name: string; isHeadquarters: boolean; isActive: boolean };

function useSwitch() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const go = (to: string, then?: () => void) =>
    start(async () => {
      const res = await switchBranchAction(to);
      if (!res.ok) return toast(res.error, "error");
      then?.();
      router.refresh();
    });
  return { pending, go };
}

/** Choose the branch the back office works on, or "All branches" (headquarters overview). macOS-style popover. */
export function BranchSwitcher({ branches, current, className }: { branches: SwitcherBranch[]; current: string | null; className?: string }) {
  const { pending, go } = useSwitch();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (branches.length < 2) return null;
  const selected = branches.find((b) => b.id === current);
  const pick = (to: string) => {
    setOpen(false);
    if (to !== (current ?? "all")) go(to);
  };

  return (
    <div ref={ref} className={clsx("relative", className)}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Branch"
        data-testid="branch-switcher"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "press flex h-8 w-full max-w-[260px] items-center gap-2 rounded-full border border-line bg-surface/70 pl-1 pr-2.5 text-[13px] font-medium text-ink shadow-[0_1px_2px_rgb(0_0_0/0.04)] hover:border-line-strong dark:bg-white/[0.06]",
          open && "border-primary/50 ring-4 ring-primary/15",
        )}
      >
        <span
          className={clsx(
            "flex size-6 shrink-0 items-center justify-center rounded-full",
            selected ? "bg-primary-soft text-primary" : "bg-primary text-white shadow-[0_2px_8px_-2px_var(--primary-glow)]",
          )}
        >
          {selected ? <Building2 className="size-3.5" /> : <Layers className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1 truncate text-left">{selected ? selected.name : "All branches"}</span>
        {!selected && <span className="hidden rounded-full bg-fill px-1.5 text-[10.5px] font-semibold text-muted sm:inline">HQ</span>}
        {pending ? <Loader2 className="size-3.5 animate-spin text-muted" /> : <ChevronsUpDown className="size-3.5 text-muted" />}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Branches"
          className="glass-strong shadow-pop animate-pop absolute left-0 top-[calc(100%+8px)] z-50 w-[280px] origin-top-left rounded-[16px] border border-line p-1.5"
        >
          <Option active={!selected} onClick={() => pick("all")} icon={<Layers className="size-4" />} title="All branches" sub="Headquarters overview" />
          <div className="mx-2 my-1 h-px bg-line" />
          {branches.map((b) => (
            <Option
              key={b.id}
              active={b.id === current}
              onClick={() => pick(b.id)}
              icon={<Building2 className="size-4" />}
              title={b.name}
              sub={b.isHeadquarters ? "Headquarters" : b.isActive ? "Branch" : "Closed"}
              dim={!b.isActive}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Option({
  active,
  onClick,
  icon,
  title,
  sub,
  dim,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  sub: string;
  dim?: boolean;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={clsx(
        "group flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-left transition-colors duration-150",
        active ? "bg-primary text-white" : "hover:bg-hover",
        dim && !active && "opacity-60",
      )}
    >
      <span className={clsx("flex size-7 shrink-0 items-center justify-center rounded-[8px]", active ? "bg-white/20" : "bg-primary-soft text-primary")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-tight">{title}</span>
        <span className={clsx("block truncate text-[11.5px] leading-tight", active ? "text-white/75" : "text-muted")}>{sub}</span>
      </span>
      {active && <Check className="size-4" strokeWidth={2.5} />}
    </button>
  );
}

/** Shown on pages that work on one branch at a time (floor, prep) while "All branches" is selected. */
export function ChooseBranch({ branches, title, description }: { branches: SwitcherBranch[]; title: string; description: string }) {
  const { pending, go } = useSwitch();
  return (
    <div className="card animate-fade-up max-w-xl overflow-hidden rounded-[20px]">
      <div className="border-b border-line px-5 py-4">
        <p className="text-[16px] font-semibold tracking-[-0.015em]">{title}</p>
        <p className="mt-0.5 text-[13px] text-muted">{description}</p>
      </div>
      <ul className="stagger p-2">
        {branches
          .filter((b) => b.isActive)
          .map((b) => (
            <li key={b.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => go(b.id)}
                className="press group flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[13.5px] hover:bg-hover disabled:opacity-60"
              >
                <span className="flex size-9 items-center justify-center rounded-[10px] bg-primary-soft text-primary">
                  <Building2 className="size-[18px]" />
                </span>
                <span className="flex-1">
                  <span className="block font-medium">{b.name}</span>
                  <span className="block text-[12px] text-muted">{b.isHeadquarters ? "Headquarters" : "Branch"}</span>
                </span>
                <ChevronRight className="size-4 text-subtle transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-primary" />
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

/** Link that first switches to a branch, then opens `href` (used in the HQ overview tables). */
export function SwitchBranchLink({ branchId, href, children, className }: { branchId: string; href: string; children: ReactNode; className?: string }) {
  const router = useRouter();
  const { pending, go } = useSwitch();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => go(branchId, () => router.push(href))}
      className={clsx("text-left hover:underline disabled:opacity-60", className)}
    >
      {children}
    </button>
  );
}
