// frontend/src/components/rnaseq-de/DEInputPanel.tsx
import { Table2 } from 'lucide-react';
import type { AnalysisJob } from '@/api/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { RNASEQ_DE_QUANTIFICATION_SOURCES } from '@/lib/constants';

interface DEInputPanelProps {
  job: AnalysisJob;
}

interface SampleParam {
  reaction_id: number;
  short_name: string;
  condition: string;
  replicate: number;
}

export function DEInputPanel({ job }: DEInputPanelProps) {
  const samples = (job.params?.samples as SampleParam[] | undefined) ?? [];
  const quantSource = (job.params?.quantification_source as string) ?? 'salmon';
  const quantLabel =
    RNASEQ_DE_QUANTIFICATION_SOURCES.find((s) => s.value === quantSource)?.label ?? quantSource;
  const refCondition = (job.params?.reference_condition as string) ?? '';

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          Sample Sheet
        </h3>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            Source: <span className="font-medium text-foreground">{quantLabel}</span>
          </span>
          {refCondition && (
            <span>
              Reference: <span className="font-medium text-foreground">{refCondition}</span>
            </span>
          )}
        </div>
      </div>

      {samples.length === 0 ? (
        <EmptyState
          icon={Table2}
          title="No sample data"
          description="The sample sheet for this DE analysis run is empty."
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-border">
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Short Name
                </th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Condition
                </th>
                <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Replicate
                </th>
              </tr>
            </thead>
            <tbody>
              {samples.map((s) => (
                <tr key={s.reaction_id} className="border-b transition-colors duration-150 hover:bg-accent/50">
                  <td className="px-3 py-2 font-medium text-foreground">{s.short_name}</td>
                  <td className="px-3 py-2 text-foreground">{s.condition}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-foreground">{s.replicate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
