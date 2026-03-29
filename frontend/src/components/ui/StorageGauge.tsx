// frontend/src/components/ui/StorageGauge.tsx
import { formatBytes } from '@/lib/utils';

interface StorageGaugeProps {
  usedBytes: number;
  quotaBytes?: number;
  label?: string;
}

export function StorageGauge({ usedBytes, quotaBytes, label = 'Storage' }: StorageGaugeProps) {
  const hasQuota = quotaBytes !== undefined && quotaBytes > 0;
  const percent = hasQuota ? Math.min(100, Math.round((usedBytes / quotaBytes) * 100)) : 0;
  const barColor = percent > 90 ? 'bg-red-500' : percent > 70 ? 'bg-amber-500' : 'bg-primary';

  return (
    <div>
      <p className="font-display text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      {hasQuota ? (
        <>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full rounded-full transition-all duration-300 ${barColor}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {formatBytes(usedBytes)} / {formatBytes(quotaBytes)} ({percent}%)
          </p>
        </>
      ) : (
        <p className="font-mono text-sm text-foreground">{formatBytes(usedBytes)}</p>
      )}
    </div>
  );
}
