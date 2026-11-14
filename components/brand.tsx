import { clsx } from "clsx";

/**
 * Brand mark: a copper tile with a soft top light, holding a stylised cup /
 * receipt glyph. Used on the home, sign-in and sign-up pages.
 */
export function BrandMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-[#eaa46a] via-[#cc7736] to-[#93491a] text-white",
        "shadow-[0_10px_30px_-10px_var(--primary-glow),inset_0_1px_0_rgb(255_255_255/0.4),inset_0_-1px_0_rgb(0_0_0/0.15)]",
        className,
      )}
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
    >
      <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent" />
      <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="relative">
        <path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V9Z" />
        <path d="M16 10.5h1.5a2.5 2.5 0 0 1 0 5H16" />
        <path d="M8.5 3.5c0 1 1 1.5 1 2.5M11.5 3.5c0 1 1 1.5 1 2.5" />
      </svg>
    </span>
  );
}
