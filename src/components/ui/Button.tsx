import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary:
    "bg-rosewood text-white shadow-[0_8px_24px_-10px_rgba(140,72,64,0.65)] hover:bg-rosewood-deep active:translate-y-px",
  secondary:
    "border border-cocoa/15 bg-white/55 text-cocoa hover:border-cocoa/25 hover:bg-white/80 active:translate-y-px",
  ghost: "text-cocoa-soft hover:bg-cocoa/[0.055] hover:text-cocoa",
  danger: "bg-[#8f3f3a] text-white hover:bg-[#7c342f]",
  soft: "bg-blush text-rosewood-deep hover:bg-[#eed4cc]",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-[0.82rem] gap-1.5",
  md: "h-11 px-5 text-sm gap-2",
  lg: "h-12 px-6 text-[0.95rem] gap-2.5",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center rounded-full font-medium tracking-[-0.01em] transition-[background-color,border-color,color,transform,box-shadow] duration-200 disabled:pointer-events-none disabled:opacity-50",
    "outline-none focus-visible:ring-2 focus-visible:ring-rosewood focus-visible:ring-offset-2 focus-visible:ring-offset-parchment",
    variants[variant],
    sizes[size],
    className,
  );
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export const inputClasses =
  "h-11 w-full rounded-2xl border border-cocoa/15 bg-white/60 px-4 text-[0.95rem] text-cocoa outline-none transition placeholder:text-cocoa-soft/60 focus:border-rosewood/55 focus:bg-white/85 focus:ring-4 focus:ring-rosewood/10 disabled:opacity-60";
