import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dark" | "outline" | "whatsapp";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/30",
  secondary: "bg-brand-50 text-brand-700 hover:bg-brand-100",
  ghost: "bg-transparent text-ink-soft hover:bg-black/5",
  danger: "bg-red-600 text-white hover:bg-red-700",
  dark: "bg-ink text-white hover:bg-ink-soft",
  outline: "border border-black/15 bg-white text-ink hover:bg-black/[0.03]",
  whatsapp: "bg-[#25D366] text-white hover:bg-[#1ebe5b] shadow-sm shadow-[#25D366]/30",
};
const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm rounded-lg",
  md: "h-11 px-4 text-[15px] rounded-xl",
  lg: "h-14 px-6 text-base rounded-2xl",
};

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; block?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "md", loading, block, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        "inline-flex select-none items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
      {children}
    </button>
  );
});

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return cn("inline-flex select-none items-center justify-center gap-2 font-semibold transition active:scale-[0.98]", variants[variant], sizes[size], extra);
}
