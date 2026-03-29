// frontend/src/components/diffbind/DiffBindInputPanel.tsx
import type { AnalysisJob } from '@/api/types';
import { DIFFBIND_ANALYSIS_METHODS } from '@/lib/constants';

interface DiffBindInputPanelProps {
  job: AnalysisJob;
}

interface SampleParam {
  reaction_id: number;
  short_name: string;
  condition: string;
  replicate: number;
  peak_caller?: string;
}

export function DiffBindInputPanel({ job }: DiffBindInputPanelProps) {
  const samples = (job.params?.samples as SampleParam[] | undefined) ?? [];
  const analysisMethod = (job.params?.analysis_method as string) ?? '';
  const methodLabel =
    DIFFBIND_ANALYSIS_METHODS.find((m) => m.value === analysisMethod)?.label ?? analysisMethod;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Sample Sheet
        </h3>
        <span className="text-xs text-muted-foreground">
          Method: <span className="font-medium text-foreground">{methodLabel}</span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Short Name
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Condition
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Replicate
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Peak Caller
              </th>
            </tr>
          </thead>
          <tbody>
            {samples.map((s) => (
              <tr key={s.reaction_id} className="border-b hover:bg-muted">
                <td className="px-3 py-2 font-medium text-foreground">{s.short_name}</td>
                <td className="px-3 py-2 text-foreground">{s.condition}</td>
                <td className="px-3 py-2 font-mono text-foreground">{s.replicate}</td>
                <td className="px-3 py-2 text-foreground">{s.peak_caller ?? '—'}</td>
              </tr>
            ))}
            {samples.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  No sample data available.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
