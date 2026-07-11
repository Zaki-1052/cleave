// frontend/src/components/ui/Input.tsx — labeled text input. Owns the specimen-label
// eyebrow and the single error convention; rings only on keyboard focus.
import { useId, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = `${inputId}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={inputId}
        className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
      >
        {label}
        {props.required && <span className="text-destructive"> *</span>}
      </label>
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          'rounded-md border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25',
          error ? 'border-destructive' : 'border-input',
          className,
        )}
        {...props}
      />
      {error && (
        <span id={errorId} className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
