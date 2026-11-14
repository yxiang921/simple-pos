"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { clsx } from "clsx";

/**
 * Light / dark / automatic theme. The choice is kept in localStorage and
 * applied as the `dark` class on <html> — before first paint by THEME_SCRIPT
 * (app/layout.tsx), and live when changed or when the system theme changes.
 */
export type ThemeChoice = "light" | "dark" | "system";
const KEY = "pos.theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${KEY}');var d=t==='dark'||((!t||t==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

const listeners = new Set<() => void>();
function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

function apply(choice: ThemeChoice) {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  const root = document.documentElement;
  if (root.classList.contains("dark") === dark) return;
  const swap = () => root.classList.toggle("dark", dark);
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (doc.startViewTransition && !reduce) doc.startViewTransition(swap);
  else swap();
}

export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* storage unavailable */
  }
  apply(choice);
  listeners.forEach((l) => l());
}

export function useTheme(): ThemeChoice {
  return useSyncExternalStore(subscribe, read, () => "system");
}

/** Follows the system theme while "Auto" is selected. */
function useSystemSync(choice: ThemeChoice) {
  useEffect(() => {
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);
}

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "Auto", icon: Monitor },
];

/** Segmented control (macOS style) with a sliding thumb. */
export function ThemeToggle({ className }: { className?: string }) {
  const choice = useTheme();
  useSystemSync(choice);
  const index = OPTIONS.findIndex((o) => o.value === choice);
  return (
    <div
      role="radiogroup"
      aria-label="Appearance"
      className={clsx("relative inline-grid h-8 grid-cols-3 rounded-full border border-line bg-fill p-0.5", className)}
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 w-[calc((100%-4px)/3)] rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.15)] transition-transform duration-300 ease-[var(--ease-spring)] dark:bg-[#3a3a3d]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={choice === value}
          title={label}
          onClick={() => setTheme(value)}
          className={clsx(
            "press relative z-10 flex w-8 items-center justify-center rounded-full",
            choice === value ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          <Icon className="size-[15px]" strokeWidth={2} />
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}
