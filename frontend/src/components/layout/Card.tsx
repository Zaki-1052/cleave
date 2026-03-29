// frontend/src/components/layout/Card.tsx
import type { ReactNode } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const cardVariants = cva(
  'rounded-lg border border-border bg-card p-6',
  {
    variants: {
      variant: {
        default: 'shadow-sm dark:shadow-none',
        interactive:
          'shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-primary/20 transition-all duration-200 dark:shadow-none dark:hover:border-primary/30',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

interface CardProps extends VariantProps<typeof cardVariants> {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className, variant }: CardProps) {
  return (
    <div className={cn(cardVariants({ variant }), className)}>
      {children}
    </div>
  );
}
