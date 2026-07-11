// frontend/src/components/peak-calling/PeakCallingInputPanel.tsx
import { ListX } from 'lucide-react';
import type { AnalysisJob } from '@/api/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { GENOME_DISPLAY_NAMES } from '@/lib/constants';

interface PeakCallingInputPanelProps {
  job: AnalysisJob;
}

interface ReactionParam {
  reaction_id: number;
  short_name: string;
  igg_short_name: string | null;
}

export function PeakCallingInputPanel({ job }: PeakCallingInputPanelProps) {
  const reactions = (job.params?.reactions as ReactionParam[] | undefined) ?? [];
  const genome = (job.params?.reference_genome as string) ?? '';
  const peakCaller = (job.params?.peak_caller as string) ?? '';
  const peakSize = (job.params?.peak_size as string) ?? '';

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Reactions</h3>
      </div>

      {reactions.length === 0 ? (
        <EmptyState
          icon={ListX}
          title="No reactions recorded"
          description="This peak calling run has no input reactions."
        />
      ) : (
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Short Name
              </th>
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                IgG Control
              </th>
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Reference Genome
              </th>
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Peak Caller
              </th>
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Peak Size
              </th>
            </tr>
          </thead>
          <tbody>
            {reactions.map((r) => (
              <tr key={r.reaction_id} className="border-b border-border/70 transition-colors duration-150 hover:bg-accent/50">
                <td className="px-3 py-2 font-medium text-foreground">{r.short_name}</td>
                <td className="px-3 py-2 text-foreground">{r.igg_short_name ?? '—'}</td>
                <td className="px-3 py-2 text-foreground">
                  {GENOME_DISPLAY_NAMES[genome] ?? genome}
                </td>
                <td className="px-3 py-2 text-foreground">{peakCaller}</td>
                <td className="px-3 py-2 text-foreground capitalize">{peakSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
