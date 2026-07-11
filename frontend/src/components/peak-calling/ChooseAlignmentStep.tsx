// frontend/src/components/peak-calling/ChooseAlignmentStep.tsx
import { Inbox } from 'lucide-react';
import type { AnalysisJob } from '@/api/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { GENOME_DISPLAY_NAMES } from '@/lib/constants';
import { formatDate } from '@/lib/utils';

interface ChooseAlignmentStepProps {
  alignmentJobs: AnalysisJob[];
  selectedAlignmentJobId: number | null;
  onSelect: (jobId: number) => void;
}

export function ChooseAlignmentStep({
  alignmentJobs,
  selectedAlignmentJobId,
  onSelect,
}: ChooseAlignmentStepProps) {
  const completedJobs = alignmentJobs.filter((j) => j.status === 'complete');

  if (completedJobs.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No completed alignment runs available"
        description="Run an alignment first before creating a peak calling analysis."
      />
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Select a completed alignment run to use as input for peak calling.
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Name
              </th>
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Reference Genome
              </th>
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Reactions
              </th>
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Created
              </th>
            </tr>
          </thead>
          <tbody>
            {completedJobs.map((job) => {
              const genome = (job.params?.reference_genome as string) ?? '';
              const reactions = (job.params?.reactions as unknown[]) ?? [];
              const isSelected = selectedAlignmentJobId === job.id;
              return (
                <tr
                  key={job.id}
                  onClick={() => onSelect(job.id)}
                  className={`cursor-pointer border-b border-border/70 transition-colors duration-150 ${
                    isSelected ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="radio"
                      name="alignment-job"
                      checked={isSelected}
                      onChange={() => onSelect(job.id)}
                      aria-label={`Select alignment ${job.name}`}
                      className="h-4 w-4 accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{job.name}</td>
                  <td className="px-3 py-2 text-foreground">
                    {GENOME_DISPLAY_NAMES[genome] ?? genome}
                  </td>
                  <td className="px-3 py-2 font-mono tabular-nums text-foreground">{reactions.length}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-foreground">{formatDate(job.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{completedJobs.length}</span> completed alignment
        {completedJobs.length !== 1 ? 's' : ''} available
      </p>
    </div>
  );
}
