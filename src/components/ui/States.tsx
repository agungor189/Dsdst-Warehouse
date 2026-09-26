import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./utils";

export type EmptyStateProps = { title: ReactNode; description?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string; };
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return <div className={cn("state-card text-center", className)}>{icon}{<div><p className="font-black">{title}</p>{description && <p className="mt-1 text-sm text-muted">{description}</p>}</div>}{action}</div>;
}

export type LoadingStateProps = { label?: ReactNode; className?: string; compact?: boolean; };
export function LoadingState({ label = "Yükleniyor", className, compact = false }: LoadingStateProps) {
  return <div className={cn("state-card", compact && "!min-h-24", className)} role="status"><LoaderCircle className="animate-spin text-moss" size={30}/><p className="font-bold">{label}</p></div>;
}
