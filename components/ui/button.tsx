import { clsx } from "clsx";
import Link from "next/link";
import type { ComponentProps } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "danger-outline";
type Size = "sm" | "md" | "lg" | "icon";

const base =
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[4px] font-medium select-none " +
  "transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50 [&_svg]:shrink-0";

const variants: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover active:bg-primary-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-hover",
  ghost: "text-ink hover:bg-hover",
  danger: "bg-danger text-white hover:bg-[#931c13]",
  "danger-outline": "border border-line-strong bg-surface text-danger hover:bg-danger-soft",
};

const sizes: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[13px] [&_svg]:size-3.5",
  md: "h-8 px-3 text-[13px] [&_svg]:size-4",
  lg: "h-11 px-4 text-[15px] [&_svg]:size-4",
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
