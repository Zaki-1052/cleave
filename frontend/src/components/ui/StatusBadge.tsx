// frontend/src/components/ui/StatusBadge.tsx
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';
import { cn } from '@/lib/cn';

interface StatusBadgeProps {
  status: string;
}

const STATUS_TINTS: Record<string, string> = {
  new: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  queued: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  in_progress: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  running: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
  complete: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
  error: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300',
  terminated: 'bg-muted text-muted-foreground',
};

const ACTIVE_STATUSES = new Set(['running', 'in_progress']);

const DOT_GLOW: Record<string, string> = {
  running: '0 0 6px #00BCD4',
  in_progress: '0 0 6px #00BCD4',
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const dotColor = STATUS_COLORS[status] ?? 'bg-muted-foreground';
  const label = STATUS_LABELS[status] ?? status;
  const tint = STATUS_TINTS[status] ?? 'bg-muted text-muted-foreground';

  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium', tint)}>
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          dotColor,
          ACTIVE_STATUSES.has(status) && 'animate-pulse',
        )}
        style={DOT_GLOW[status] ? { boxShadow: DOT_GLOW[status] } : undefined}
      />
      {label}
    </span>
  );
}
