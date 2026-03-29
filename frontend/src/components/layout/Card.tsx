// frontend/src/components/layout/Card.tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className }: CardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-card p-6', className)}>
      {children}
    </div>
  );
}
