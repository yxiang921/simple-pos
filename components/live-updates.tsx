"use client";

import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { clsx } from "clsx";

export type LiveState = "connecting" | "live" | "polling";
const LiveContext = createContext<{ state: LiveState; fallbackSeconds: number }>({ state: "connecting", fallbackSeconds: 15 });

export function useLiveState() {
  return useContext(LiveContext);
}

/**
 * Subscribes to a Server-Sent Events stream and refreshes the server-rendered
 * data (router.refresh) whenever the database reports a change — at most once
 * per `minIntervalMs`. If live updates aren't available (stream error, or the
 * server can't LISTEN), it falls back to polling every `fallbackSeconds`.
 * Client state (open dialogs, forms, the floor editor) is kept across refreshes.
 */
export function LiveUpdates({
  url,
  minIntervalMs = 1000,
  fallbackSeconds = 15,
  children,
}: {
  url: string;
  minIntervalMs?: number;
  fallbackSeconds?: number;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [state, setState] = useState<LiveState>("connecting");

  useEffect(() => {
    let last = 0;
    let trailing: ReturnType<typeof setTimeout> | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let missed = false; // true after a gap, so we catch up when live again

    const refresh = () => {
      const wait = last + minIntervalMs - Date.now();
      if (wait <= 0) {
        last = Date.now();
        router.refresh();
      } else if (!trailing) {
        trailing = setTimeout(() => {
          trailing = null;
          last = Date.now();
          router.refresh();
        }, wait);
      }
    };
    const startPolling = () => {
      missed = true;
      setState("polling");
      if (!poll) poll = setInterval(() => document.visibilityState === "visible" && refresh(), fallbackSeconds * 1000);
    };
    const stopPolling = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    const es = new EventSource(url);
    es.addEventListener("status", (e) => {
      const { status } = JSON.parse((e as MessageEvent).data) as { status: string };
      if (status === "live") {
        stopPolling();
        setState("live");
        if (missed) refresh();
        missed = false;
      } else startPolling();
    });
    es.addEventListener("change", () => refresh());
    es.onerror = () => startPolling(); // EventSource reconnects on its own; poll meanwhile

    const onVisible = () => {
      if (document.visibilityState === "visible" && (missed || poll)) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      es.close();
      stopPolling();
      if (trailing) clearTimeout(trailing);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, minIntervalMs, fallbackSeconds, router]);

  return <LiveContext.Provider value={{ state, fallbackSeconds }}>{children}</LiveContext.Provider>;
}

/** Small status label: "Live" when pushed updates work, otherwise the polling interval. */
export function LiveIndicator({ className }: { className?: string }) {
  const { state, fallbackSeconds } = useLiveState();
  return (
    <span
      className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]", className)}
      title={
        state === "live"
          ? "Changes appear instantly"
          : state === "polling"
            ? `Live updates unavailable — refreshing every ${fallbackSeconds} s`
            : "Connecting to live updates…"
      }
    >
      <span className={clsx("relative inline-flex size-2 rounded-full", state === "live" ? "bg-success text-success" : "bg-subtle")}>
        {state === "live" && <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-50 [animation-duration:2.2s]" />}
      </span>
      <span className={clsx("font-medium", state === "live" ? "text-success" : "text-muted")}>
        {state === "live" ? "Live" : state === "polling" ? `Every ${fallbackSeconds} s` : "Connecting…"}
      </span>
    </span>
  );
}

/** Guest pages: menu changes everywhere, plus the order's own status on the confirmation page. */
export function GuestLiveUpdates({ base }: { base: string }) {
  const pathname = usePathname();
  const orderId = pathname.startsWith(`${base}/success/`) ? pathname.slice(base.length + 9).split("/")[0] : undefined;
  return (
    <LiveUpdates
      url={orderId ? `${base}/events?order=${encodeURIComponent(orderId)}` : `${base}/events`}
      minIntervalMs={orderId ? 1000 : 3000}
      fallbackSeconds={orderId ? 15 : 60}
    />
  );
}
