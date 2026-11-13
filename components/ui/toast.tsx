"use client";

import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { clsx } from "clsx";

type Toast = { id: number; message: string; tone: "success" | "error" };
const ToastContext = createContext<(message: string, tone?: Toast["tone"]) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((message: string, tone: Toast["tone"] = "success") => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 6000 : 3500);
  }, []);

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={clsx(
              "pointer-events-auto flex items-start gap-2 rounded-[4px] border bg-surface px-3 py-2.5 text-[13px] shadow-[0_4px_12px_rgb(0_0_0/0.08)]",
              t.tone === "error" ? "border-danger/40" : "border-line-strong",
            )}
          >
            {t.tone === "error" ? (
              <AlertCircle className="mt-px size-4 shrink-0 text-danger" />
            ) : (
              <CheckCircle2 className="mt-px size-4 shrink-0 text-primary" />
            )}
            <span className="flex-1">{t.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}
              className="text-muted hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
