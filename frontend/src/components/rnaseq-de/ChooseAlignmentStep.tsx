// frontend/src/components/rnaseq-de/ChooseAlignmentStep.tsx
import { Workflow } from 'lucide-react';
import type { AnalysisJob } from '@/api/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
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
        icon={Workflow}
        title="No completed RNA-seq alignment runs"
        description="Run an RNA-seq alignment (STAR + Salmon) first before creating a DE analysis."
      />
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Select a completed RNA-seq alignment run. Salmon quantification data from this run will be
        used as input for DESeq2 differential expression analysis.
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-border">
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Name
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Genome
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Reactions
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Created
              </th>
              <th className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Status
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
                  className={`cursor-pointer border-b transition-colors duration-150 ${
                    isSelected ? 'bg-primary/5' : 'hover:bg-accent/50'
                  }`}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="radio"
                      name="alignment-job"
                      checked={isSelected}
                      onChange={() => onSelect(job.id)}
                      aria-label={`Select alignment run ${job.name}`}
                      className="h-4 w-4 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{job.name}</td>
                  <td className="px-3 py-2 font-mono text-foreground">{genome}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-foreground">{reactions.length}</td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums text-foreground">{formatDate(job.createdAt)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={job.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{completedJobs.length}</span> completed alignment run{completedJobs.length !== 1 ? 's' : ''}{' '}
        available
      </p>
    </div>
  );
}
