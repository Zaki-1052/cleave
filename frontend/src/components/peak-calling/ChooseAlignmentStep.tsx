// frontend/src/components/peak-calling/ChooseAlignmentStep.tsx
import type { AnalysisJob } from '@/api/types';
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
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <h3 className="text-sm font-medium text-gray-600">
          No completed alignment runs available
        </h3>
        <p className="mt-1 text-sm text-gray-400">
          Run an alignment first before creating a peak calling analysis.
        </p>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-sm text-gray-600">
        Select a completed alignment run to use as input for peak calling.
      </p>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b bg-primary/10">
              <th className="w-10 px-3 py-2" />
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Name
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Reference Genome
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                Reactions
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
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
                  className={`cursor-pointer border-b transition-colors ${
                    isSelected ? 'bg-primary/5' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="px-3 py-2 text-center">
                    <input
                      type="radio"
                      name="alignment-job"
                      checked={isSelected}
                      onChange={() => onSelect(job.id)}
                      className="h-4 w-4 text-primary focus:ring-primary"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-800">{job.name}</td>
                  <td className="px-3 py-2 text-gray-700">
                    {GENOME_DISPLAY_NAMES[genome] ?? genome}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{reactions.length}</td>
                  <td className="px-3 py-2 text-gray-700">{formatDate(job.createdAt)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-gray-400">
        {completedJobs.length} completed alignment{completedJobs.length !== 1 ? 's' : ''} available
      </p>
    </div>
  );
}
