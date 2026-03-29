// frontend/src/components/ui/Spinner.tsx
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/cn';

const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-8 w-8' } as const;

export function Spinner({ size = 'md', className }: { size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return <Loader2 className={cn(sizes[size], 'animate-spin text-primary', className)} />;
}
