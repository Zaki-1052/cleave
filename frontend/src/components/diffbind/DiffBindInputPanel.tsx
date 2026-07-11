// frontend/src/components/diffbind/DiffBindInputPanel.tsx
import { Table2 } from 'lucide-react';
import type { AnalysisJob } from '@/api/types';
import { EmptyState } from '@/components/ui/EmptyState';
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
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Sample Sheet
        </h3>
        <span className="text-xs text-muted-foreground">
          Method: <span className="font-medium text-foreground">{methodLabel}</span>
        </span>
      </div>

      {samples.length === 0 ? (
        <EmptyState
          icon={Table2}
          title="No sample data"
          description="The sample sheet for this DiffBind run is empty."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b bg-muted">
                <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Short Name
                </th>
                <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Condition
                </th>
                <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Replicate
                </th>
                <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  Peak Caller
                </th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr
                  key={s.reaction_id}
                  className="border-b transition-colors duration-150 hover:bg-accent/50"
                >
                  <td className="px-3 py-2 font-medium text-foreground">{s.short_name}</td>
                  <td className="px-3 py-2 text-foreground">{s.condition}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-foreground">{s.replicate}</td>
                  <td className="px-3 py-2 text-foreground">{s.peak_caller ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
