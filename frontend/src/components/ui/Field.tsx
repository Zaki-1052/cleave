// frontend/src/components/ui/Field.tsx — form-field wrapper for controls that aren't the
// Input primitive (selects, textareas, custom pickers). Owns the specimen-label eyebrow,
// help text, and the single error convention (text-destructive).
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface FieldProps {
  label: string;
  htmlFor?: string;
  required?: boolean;
  help?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}

export function Field({ label, htmlFor, required, help, error, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label
        htmlFor={htmlFor}
        className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
      >
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
      {help && !error && <span className="text-xs text-muted-foreground/80">{help}</span>}
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
