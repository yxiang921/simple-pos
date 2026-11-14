import { clsx } from "clsx";
import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";
type Size = "sm" | "md" | "lg" | "icon";

// Apple-style capsule buttons with press feedback.
const base =
  "press inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-medium select-none " +
  "disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  primary: "btn-primary bg-primary text-white hover:bg-primary-hover",
  secondary:
    "highlight border border-line bg-surface/80 text-ink shadow-[0_1px_2px_rgb(0_0_0/0.05)] hover:border-line-strong hover:bg-surface " +
    "dark:bg-white/[0.07] dark:hover:bg-white/[0.11]",
  ghost: "text-ink hover:bg-hover",
  danger: "bg-danger text-white shadow-[0_6px_16px_-8px_var(--danger)] hover:brightness-110",
  "danger-outline": "border border-line bg-surface/80 text-danger hover:bg-danger-soft dark:bg-white/[0.06]",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-3 text-[12.5px] [&_svg]:size-3.5",
  md: "h-8 px-3.5 text-[13px] [&_svg]:size-4",
  lg: "h-11 px-5 text-[15px] [&_svg]:size-4",
  icon: "size-8 [&_svg]:size-4",
};

export function buttonClass(variant: Variant = "secondary", size: Size = "md", className?: string) {
  return clsx(base, variants[variant], sizes[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}
