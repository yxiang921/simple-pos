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
        "m-auto w-[calc(100%-2rem)] rounded-[6px] border border-line bg-surface p-0 text-ink shadow-[0_8px_24px_rgb(0_0_0/0.12)]",
        { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" }[width],
      )}
    >
      {open && (
        <div>
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-3.5">
            <div>
              <h2 className="text-[15px] font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="-mr-1 rounded-[4px] p-1 text-muted hover:bg-hover hover:text-ink"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="-mx-5 -mb-4 mt-5 flex justify-end gap-2 border-t border-line bg-[#fafaf8] px-5 py-3">{children}</div>;
}
