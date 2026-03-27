// frontend/src/components/ui/DetailRow.tsx

export const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0">
    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
    <span className="text-sm text-gray-800">{children}</span>
  </div>
);
