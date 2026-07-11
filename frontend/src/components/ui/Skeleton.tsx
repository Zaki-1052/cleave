// frontend/src/components/ui/Skeleton.tsx — layout-stable loading placeholder.
// Compose into shapes that mirror the loaded content (cards, table rows, detail lists).
import { cn } from '@/lib/cn';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}
