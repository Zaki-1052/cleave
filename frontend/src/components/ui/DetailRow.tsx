// frontend/src/components/ui/DetailRow.tsx

export const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between border-b border-border py-2 last:border-0">
    <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
    <span className="text-sm text-foreground">{children}</span>
  </div>
);
