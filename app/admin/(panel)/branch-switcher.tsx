"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { useToast } from "@/components/ui/toast";
import { switchBranchAction } from "../_actions/branches";

export type SwitcherBranch = { id: string; name: string; isHeadquarters: boolean; isActive: boolean };

/** Choose the branch the back office works on, or "All branches" (headquarters overview). */
export function BranchSwitcher({
  branches,
  current,
  className,
}: {
  branches: SwitcherBranch[];
  current: string | null;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  if (branches.length < 2) return null;

  return (
    <label className={clsx("relative inline-flex items-center", className)}>
      <span className="sr-only">Branch</span>
      <select
        value={current ?? "all"}
        disabled={pending}
        onChange={(e) => {
          const to = e.target.value;
          start(async () => {
            const res = await switchBranchAction(to);
            if (res.ok) router.refresh();
            else toast(res.error, "error");
          });
        }}
        className="h-8 max-w-[220px] appearance-none truncate rounded-[4px] border border-line bg-surface pl-2.5 pr-8 text-[13px] font-medium text-ink hover:border-[#c9c9c3] focus:border-primary focus:outline-none"
      >
        <option value="all">All branches (HQ view)</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.isHeadquarters ? " · HQ" : ""}
            {b.isActive ? "" : " (closed)"}
          </option>
        ))}
      </select>
      {pending ? (
        <Loader2 className="pointer-events-none absolute right-2 size-4 animate-spin text-muted" />
      ) : (
        <ChevronDown className="pointer-events-none absolute right-2 size-4 text-muted" />
      )}
    </label>
  );
}

/** Shown on pages that work on one branch at a time (floor, prep) while "All branches" is selected. */
export function ChooseBranch({ branches, title, description }: { branches: SwitcherBranch[]; title: string; description: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <div className="max-w-xl rounded-[6px] border border-line bg-surface">
      <div className="border-b border-line px-4 py-3">
        <p className="text-[14px] font-semibold">{title}</p>
        <p className="mt-0.5 text-[13px] text-muted">{description}</p>
      </div>
      <ul className="divide-y divide-line">
        {branches
          .filter((b) => b.isActive)
          .map((b) => (
            <li key={b.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await switchBranchAction(b.id);
                    if (res.ok) router.refresh();
                    else toast(res.error, "error");
                  })
                }
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] hover:bg-hover disabled:opacity-60"
              >
                <span className="font-medium">{b.name}</span>
                <span className="text-muted">{b.isHeadquarters ? "Headquarters" : "Open"} →</span>
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

/** Link that first switches to a branch, then opens `href` (used in the HQ overview tables). */
export function SwitchBranchLink({ branchId, href, children, className }: { branchId: string; href: string; children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await switchBranchAction(branchId);
          if (!res.ok) return toast(res.error, "error");
          router.push(href);
          router.refresh();
        })
      }
      className={clsx("text-left hover:underline disabled:opacity-60", className)}
    >
      {children}
    </button>
  );
}
