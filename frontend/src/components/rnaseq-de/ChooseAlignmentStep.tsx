// frontend/src/components/rnaseq-de/ChooseAlignmentStep.tsx
import type { AnalysisJob } from '@/api/types';
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
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <h3 className="text-sm font-medium text-muted-foreground">
          No completed RNA-seq alignment runs available
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Run an RNA-seq alignment (STAR + Salmon) first before creating a DE analysis.
        </p>
      </div>
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
            <tr className="border-b bg-primary/10">
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Name
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Genome
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Reactions
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Created
              </th>
              <th className="px-3 py-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
                  className={`cursor-pointer border-b transition-colors ${
                    isSelected ? 'bg-primary/5' : 'hover:bg-muted'
                  }`}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="radio"
                      name="alignment-job"
                      checked={isSelected}
                      onChange={() => onSelect(job.id)}
                      aria-label={`Select alignment run ${job.name}`}
                      className="h-4 w-4 text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{job.name}</td>
                  <td className="px-3 py-2 text-foreground">{genome}</td>
                  <td className="px-3 py-2 text-foreground">{reactions.length}</td>
                  <td className="px-3 py-2 text-foreground">{formatDate(job.createdAt)}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-foreground">
                      <span className="h-2 w-2 rounded-full bg-status-complete" />
                      Complete
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {completedJobs.length} completed alignment run{completedJobs.length !== 1 ? 's' : ''}{' '}
        available
      </p>
    </div>
  );
}
