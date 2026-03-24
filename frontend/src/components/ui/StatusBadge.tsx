// frontend/src/components/ui/StatusBadge.tsx
import { STATUS_COLORS, STATUS_LABELS } from '@/lib/constants';

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const colorClass = STATUS_COLORS[status] ?? 'bg-gray-400';
  const label = STATUS_LABELS[status] ?? status;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${colorClass}`} />
      <span className="text-sm text-gray-700">{label}</span>
    </span>
  );
}
