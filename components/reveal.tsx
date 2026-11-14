"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { clsx } from "clsx";

/** Fades / slides its content in when it scrolls into view (once). */
export function Reveal({ className, delay = 0, ...props }: ComponentProps<"div"> & { delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries)
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} className={clsx("reveal", className)} style={{ ["--delay" as string]: `${delay}s` }} {...props} />;
}
