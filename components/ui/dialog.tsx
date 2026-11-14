"use client";

import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { clsx } from "clsx";

/** Accessible modal built on the native <dialog> element (focus trap + Esc for free). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  width?: "sm" | "md" | "lg";
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={clsx(
        // text-left/whitespace-normal: dialogs are often rendered inside right-aligned table cells.
        "glass-strong shadow-pop m-auto w-[calc(100%-2rem)] whitespace-normal rounded-[22px] border border-line p-0 text-left text-[14px] font-normal text-ink",
        { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[width],
      )}
    >
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 px-6 pb-2 pt-5">
            <div>
              <h2 className="text-[18px] font-semibold tracking-[-0.02em]">{title}</h2>
              {description && <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="press -mr-2 -mt-1 flex size-7 items-center justify-center rounded-full bg-fill text-muted hover:text-ink"
              aria-label="Close"
            >
              <X className="size-3.5" strokeWidth={2.5} />
            </button>
          </div>
          <div className="px-6 pb-5 pt-3">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="-mx-6 -mb-5 mt-6 flex justify-end gap-2 border-t border-line bg-surface-2/50 px-6 py-3.5 dark:bg-white/[0.02]">{children}</div>;
}
