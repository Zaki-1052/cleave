// frontend/src/components/ui/Input.tsx
import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {props.required && <span className="text-destructive"> *</span>}
      </label>
      <input
        className={`rounded-md border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary ${
          error ? 'border-destructive' : 'border-input'
        } ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
