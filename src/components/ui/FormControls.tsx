import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "./utils";

type FieldShellProps = {
  id: string;
  label?: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
  required?: boolean;
  containerClassName?: string;
  children: ReactNode;
};

function FieldShell({ id, label, error, hint, required, containerClassName, children }: FieldShellProps) {
  return <div className={cn("space-y-1.5", containerClassName)}>
    {label && <label htmlFor={id} className="block text-xs font-black uppercase tracking-wide text-muted">{label}{required && <span className="ml-1 text-danger">*</span>}</label>}
    {children}
    {(error || hint) && <p id={`${id}-description`} className={cn("text-xs font-semibold", error ? "text-danger" : "text-muted")}>{error || hint}</p>}
  </div>;
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
  containerClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ id: suppliedId, label, error, hint, containerClassName, className, required, disabled, ...props }, ref) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  return <FieldShell id={id} label={label} error={error} hint={hint} required={required} containerClassName={containerClassName}>
    <input ref={ref} id={id} required={required} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${id}-description` : undefined} className={cn("field disabled:cursor-not-allowed disabled:opacity-60", className)} {...props}/>
  </FieldShell>;
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  error?: ReactNode;
  hint?: ReactNode;
  containerClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ id: suppliedId, label, error, hint, containerClassName, className, required, disabled, children, ...props }, ref) {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  return <FieldShell id={id} label={label} error={error} hint={hint} required={required} containerClassName={containerClassName}>
    <select ref={ref} id={id} required={required} disabled={disabled} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${id}-description` : undefined} className={cn("field disabled:cursor-not-allowed disabled:opacity-60", className)} {...props}>{children}</select>
  </FieldShell>;
});
