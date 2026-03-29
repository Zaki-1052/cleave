// frontend/src/components/ui/StatusBadge.tsx
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';
import { cn } from '@/lib/cn';

interface StatusBadgeProps {
  status: string;
}

const STATUS_TINTS: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700',
  queued: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-cyan-50 text-cyan-700',
  running: 'bg-cyan-50 text-cyan-700',
  complete: 'bg-green-50 text-green-700',
  error: 'bg-red-50 text-red-700',
  terminated: 'bg-gray-100 text-gray-600',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const dotColor = STATUS_COLORS[status] ?? 'bg-gray-400';
  const label = STATUS_LABELS[status] ?? status;
  const tint = STATUS_TINTS[status] ?? 'bg-gray-100 text-gray-600';

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', tint)}>
      <span className={cn('inline-block h-2 w-2 rounded-full', dotColor)} />
      {label}
    </span>
  );
}
