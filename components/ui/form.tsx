"use client";

import { clsx } from "clsx";
import { useFormStatus } from "react-dom";
import type { ComponentProps, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "./button";

const control =
  "rounded-[10px] border border-line-strong bg-surface/80 px-3 text-[14px] text-ink placeholder:text-subtle shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)] " +
  "transition-[border-color,box-shadow,background-color] duration-200 dark:bg-white/[0.05] " +
  "hover:border-[color-mix(in_srgb,var(--line-strong),var(--ink)_15%)] focus:border-primary focus:bg-surface focus:outline-none focus:ring-4 focus:ring-primary/20 dark:focus:bg-white/[0.08] " +
  "disabled:bg-fill disabled:text-muted aria-[invalid=true]:border-danger aria-[invalid=true]:ring-danger/15";

/** Full width unless the caller sets an explicit width class. */
const width = (className?: string) => (/(^|\s)(w-|min-w-|max-w-)/.test(className ?? "") ? undefined : "w-full");

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={clsx(control, width(className), "h-9", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={clsx(control, width(className), "min-h-[72px] py-2", className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={clsx(
        control,
        width(className),
        "h-9 appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat pr-8",
        "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23999' stroke-width='2.2'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E\")]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={clsx("block text-[13px] font-medium text-ink", className)} {...props} />;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  error?: string | string[];
  children: ReactNode;
  className?: string;
}) {
  const msg = Array.isArray(error) ? error[0] : error;
  return (
    <div className={clsx("space-y-1.5", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {msg ? (
        <p className="text-[12px] text-danger" role="alert">
          {msg}
        </p>
      ) : hint ? (
        <p className="text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Checkbox({ label, className, ...props }: ComponentProps<"input"> & { label: ReactNode }) {
  return (
    <label className={clsx("inline-flex cursor-pointer items-center gap-2 text-[14px]", className)}>
      <input type="checkbox" className="size-4 rounded-[5px] border-line-strong accent-[var(--primary)]" {...props} />
      <span>{label}</span>
    </label>
  );
}

export function SubmitButton({
  children,
  pendingText,
  variant = "primary",
  size = "md",
  className,
  disabled,
}: {
  children: ReactNode;
  pendingText?: string;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} className={className} disabled={pending || disabled}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending ? (pendingText ?? children) : children}
    </Button>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="animate-pop rounded-[12px] border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[13px] text-danger">
      {message}
    </div>
  );
}
