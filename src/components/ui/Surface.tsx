import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./utils";

export type CardPadding = "none" | "sm" | "md" | "lg";
const paddings: Record<CardPadding, string> = { none: "", sm: "p-3", md: "p-4", lg: "p-5" };

export interface CardProps extends HTMLAttributes<HTMLElement> { padding?: CardPadding; as?: "div" | "section" | "article" | "aside" | "main" | "form"; }
export function Card({ padding = "md", as: Component = "div", className, ...props }: CardProps) {
  return <Component className={cn("rounded-2xl border border-line bg-white shadow-sm", paddings[padding], className)} {...props}/>;
}

export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";
const badgeVariants: Record<BadgeVariant, string> = {
  default: "border-line bg-canvas text-muted",
  success: "border-emerald-200 bg-emerald-100 text-emerald-800",
  warning: "border-amber-200 bg-amber-100 text-amber-800",
  danger: "border-red-200 bg-red-100 text-danger",
  info: "border-moss/20 bg-moss/10 text-moss",
};
export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> { variant?: BadgeVariant; }
export function Badge({ variant = "default", className, ...props }: BadgeProps) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black", badgeVariants[variant], className)} {...props}/>;
}

export type PageHeaderProps = { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string; };
export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between", className)}>
    <div className="min-w-0">{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1 className="page-title">{title}</h1>{description && <p className="mt-2 max-w-3xl text-sm text-muted">{description}</p>}</div>
    {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
  </div>;
}
