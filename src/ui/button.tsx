import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "./cn";

type Variant = "primary" | "secondary" | "quiet" | "onDark";
type Size = "md" | "sm";

const base =
  "inline-flex items-center justify-center gap-2 rounded-full text-center font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-[var(--shadow-pill)] hover:bg-brand-strong",
  secondary:
    "border border-line bg-surface text-ink shadow-[var(--shadow-pill)] hover:bg-canvas-subtle",
  quiet: "text-brand-ink hover:bg-brand-soft",
  /** Sur la barre latérale sombre. */
  onDark: "text-white/80 hover:bg-white/10 hover:text-white",
};

const sizes: Record<Size, string> = {
  md: "min-h-11 px-4 py-2 text-sm leading-tight",
  sm: "min-h-9 px-3 py-1.5 text-[13px] leading-tight",
};

type StyleProps = { variant?: Variant; size?: Size; icon?: ReactNode };

function buttonClasses({ variant = "primary", size = "md" }: StyleProps = {}) {
  return cn(base, variants[variant], sizes[size]);
}

export function Button({
  variant,
  size,
  icon,
  className,
  children,
  type = "button",
  ...props
}: StyleProps & ComponentProps<"button">) {
  return (
    <button
      type={type}
      className={cn(buttonClasses({ variant, size }), className)}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  icon,
  className,
  children,
  ...props
}: StyleProps & ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(buttonClasses({ variant, size }), className)}
      {...props}
    >
      {icon}
      {children}
    </Link>
  );
}
