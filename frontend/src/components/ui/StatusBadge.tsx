// frontend/src/components/ui/StatusBadge.tsx — status pill: colored dot + mono label on a
// soft tint. Ember pulse is reserved for live states (running/in_progress) — the only
// glow in the app.
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';
import { cn } from '@/lib/cn';

interface StatusBadgeProps {
  status: string;
}

const STATUS_TINTS: Record<string, string> = {
  new: 'bg-status-new/10 text-status-new-foreground ring-status-new/25',
  queued: 'bg-status-queued/10 text-status-queued-foreground ring-status-queued/25',
  in_progress: 'bg-status-running/10 text-status-running-foreground ring-status-running/30',
  running: 'bg-status-running/10 text-status-running-foreground ring-status-running/30',
  complete: 'bg-status-complete/10 text-status-complete-foreground ring-status-complete/25',
  error: 'bg-status-error/10 text-status-error-foreground ring-status-error/30',
  terminated: 'bg-muted text-muted-foreground ring-border',
};

const ACTIVE_STATUSES = new Set(['running', 'in_progress']);

export function StatusBadge({ status }: StatusBadgeProps) {
  const dotColor = STATUS_COLORS[status] ?? 'bg-muted-foreground';
  const label = STATUS_LABELS[status] ?? status;
  const tint = STATUS_TINTS[status] ?? 'bg-muted text-muted-foreground ring-border';
  const isActive = ACTIVE_STATUSES.has(status);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wide ring-1 ring-inset',
        tint,
      )}
    >
      <span
        className={cn(
          'inline-block h-1.5 w-1.5 rounded-full',
          dotColor,
          isActive && 'animate-pulse shadow-[0_0_6px_hsl(var(--ember)/0.7)]',
        )}
      />
      {label}
    </span>
  );
}
