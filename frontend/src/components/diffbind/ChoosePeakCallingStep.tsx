// frontend/src/components/diffbind/ChoosePeakCallingStep.tsx
import { Layers } from 'lucide-react';
import type { AnalysisJob } from '@/api/types';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatDate } from '@/lib/utils';

interface ChoosePeakCallingStepProps {
  peakCallingJobs: AnalysisJob[];
  selectedPeakCallingJobId: number | null;
  onSelect: (jobId: number) => void;
}

export function ChoosePeakCallingStep({
  peakCallingJobs,
  selectedPeakCallingJobId,
  onSelect,
}: ChoosePeakCallingStepProps) {
  const completedJobs = peakCallingJobs.filter((j) => j.status === 'complete');

  if (completedJobs.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No completed peak calling runs"
        description="Run peak calling first before creating a DiffBind analysis."
      />
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Select a completed peak calling run to use as input for DiffBind differential analysis.
      </p>

      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-muted">
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Name
              </th>
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Peak Caller
              </th>
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Reactions
              </th>
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Created
              </th>
              <th className="px-3 py-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {completedJobs.map((job) => {
              const peakCaller = (job.params?.peak_caller as string) ?? '';
              const reactions = (job.params?.reactions as unknown[]) ?? [];
              const isSelected = selectedPeakCallingJobId === job.id;
              return (
                <tr
                  key={job.id}
                  onClick={() => onSelect(job.id)}
                  className={`cursor-pointer border-b transition-colors duration-150 ${
                    isSelected ? 'bg-accent' : 'hover:bg-accent/50'
                  }`}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="radio"
                      name="peak-calling-job"
                      checked={isSelected}
                      onChange={() => onSelect(job.id)}
                      aria-label={`Select peak calling run ${job.name}`}
                      className="h-4 w-4 text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-foreground">{job.name}</td>
                  <td className="px-3 py-2 text-foreground">{peakCaller}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-foreground">{reactions.length}</td>
                  <td className="px-3 py-2 font-mono tabular-nums text-foreground">{formatDate(job.createdAt)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status="complete" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        <span className="font-mono tabular-nums">{completedJobs.length}</span> completed peak calling
        run{completedJobs.length !== 1 ? 's' : ''} available
      </p>
    </div>
  );
}
