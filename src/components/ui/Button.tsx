import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "./utils";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

const variants: Record<ButtonVariant, string> = {
  primary: "primary-button",
  secondary: "secondary-button",
  danger: "primary-button !bg-danger",
  ghost: "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 font-black text-ink transition active:scale-[0.98] hover:bg-canvas disabled:opacity-40",
};

const sizes: Record<ButtonSize, string> = {
  sm: "!min-h-10 px-3 text-sm",
  md: "",
  lg: "!min-h-16 px-6 text-lg",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  loadingText?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading = false, loadingText, disabled, type = "button", className, children, ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={cn(variants[variant], sizes[size], className)} {...props}>
      {loading && <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
});
