// frontend/src/components/ui/DetailRow.tsx — label/value row for detail panels.

export const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-0">
    <span className="shrink-0 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      {label}
    </span>
    <span className="min-w-0 text-right text-sm text-foreground">{children}</span>
  </div>
);
