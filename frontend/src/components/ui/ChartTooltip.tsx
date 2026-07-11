// frontend/src/components/ui/ChartTooltip.tsx — shared Recharts tooltip content.
// Identity comes from the color chip; text wears text tokens; values are mono/tabular.
// Pass to Recharts as: <Tooltip content={<ChartTooltipContent />} />
interface TooltipEntry {
  name?: string | number;
  value?: string | number;
  color?: string;
  // Recharts also passes dataKey/payload; we only render name/value/color.
}

interface ChartTooltipContentProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  /** Optional formatter for values (e.g. percentages, bytes). */
  formatValue?: (value: string | number | undefined, entry: TooltipEntry) => string;
}

export function ChartTooltipContent({
  active,
  label,
  payload,
  formatValue,
}: ChartTooltipContentProps) {
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label !== undefined && label !== '' && (
        <p className="mb-1.5 font-medium text-foreground">{label}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="inline-block h-2.5 w-2.5 rounded-[3px]"
                style={{ backgroundColor: entry.color }}
              />
              {entry.name}
            </span>
            <span className="font-mono tabular-nums text-foreground">
              {formatValue ? formatValue(entry.value, entry) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
