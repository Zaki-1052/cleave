// frontend/src/components/ui/Button.tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outlined';
  children: ReactNode;
}

export function Button({ variant = 'primary', children, className = '', ...props }: ButtonProps) {
  const base = 'rounded-full px-6 py-2 text-sm font-medium transition-colors disabled:opacity-50';
  const variants = {
    primary: 'bg-primary text-white hover:bg-primary-dark',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    outlined: 'border border-primary text-primary hover:bg-primary/10',
  };

  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
