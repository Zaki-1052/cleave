// frontend/src/components/rnaseq-de/DEInputPanel.tsx
import type { AnalysisJob } from '@/api/types';
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
        <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
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
            </tr>
          </thead>
          <tbody>
            {samples.map((s) => (
              <tr key={s.reaction_id} className="border-b hover:bg-muted">
                <td className="px-3 py-2 font-medium text-foreground">{s.short_name}</td>
                <td className="px-3 py-2 text-foreground">{s.condition}</td>
                <td className="px-3 py-2 font-mono text-foreground">{s.replicate}</td>
              </tr>
            ))}
            {samples.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-sm text-muted-foreground">
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
