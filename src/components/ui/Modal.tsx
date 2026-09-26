import { X } from "lucide-react";
import { useEffect, useId, type MouseEvent, type ReactNode } from "react";
import { Button } from "./Button";
import { cn } from "./utils";

export type ModalSize = "sm" | "md" | "lg" | "xl";
const sizes: Record<ModalSize, string> = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-3xl", xl: "max-w-5xl" };
export type ModalProps = { open: boolean; onClose: () => void; title?: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: ModalSize; className?: string; closeOnBackdrop?: boolean; closeOnEscape?: boolean; showCloseButton?: boolean; ariaLabel?: string; };

export function Modal({ open, onClose, title, description, children, footer, size = "md", className, closeOnBackdrop = true, closeOnEscape = true, showCloseButton = true, ariaLabel }: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const listener = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [closeOnEscape, onClose, open]);
  if (!open) return null;
  const backdrop = (event: MouseEvent<HTMLDivElement>) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); };
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-forest/60 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={backdrop}>
    <div role="dialog" aria-modal="true" aria-label={!title ? ariaLabel : undefined} aria-labelledby={title ? titleId : undefined} aria-describedby={description ? descriptionId : undefined} className={cn("flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-line bg-white shadow-2xl sm:rounded-3xl", sizes[size], className)}>
      {(title || description || showCloseButton) && <div className="flex items-start justify-between gap-4 border-b border-line p-5"><div>{title && <h2 id={titleId} className="text-xl font-black">{title}</h2>}{description && <p id={descriptionId} className="mt-1 text-sm text-muted">{description}</p>}</div>{showCloseButton && <Button variant="ghost" size="sm" className="p-2" aria-label="Kapat" onClick={onClose}><X size={20}/></Button>}</div>}
      <div className="overflow-y-auto p-5">{children}</div>
      {footer && <div className="flex flex-wrap justify-end gap-3 border-t border-line bg-canvas/60 p-4">{footer}</div>}
    </div>
  </div>;
}

export type ConfirmDialogProps = { open: boolean; onClose: () => void; onConfirm: () => void | Promise<void>; title: ReactNode; description?: ReactNode; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; loading?: boolean; };
export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Onayla", cancelLabel = "Vazgeç", destructive = false, loading = false }: ConfirmDialogProps) {
  return <Modal open={open} onClose={onClose} title={title} size="sm" closeOnBackdrop={!loading} closeOnEscape={!loading} footer={<><Button variant="secondary" disabled={loading} onClick={onClose}>{cancelLabel}</Button><Button variant={destructive ? "danger" : "primary"} loading={loading} onClick={() => void onConfirm()}>{confirmLabel}</Button></>}>
    {description && <p className="text-sm leading-6 text-muted">{description}</p>}
  </Modal>;
}
