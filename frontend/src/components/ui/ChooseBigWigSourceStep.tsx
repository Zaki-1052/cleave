// frontend/src/components/ui/ChooseBigWigSourceStep.tsx
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/layout/Card';
import { useJobs, useJobOutputs } from '@/hooks/useJobs';
import type { AnalysisJob, Experiment, JobOutput } from '@/api/types';
import type { BigWigSourceType } from '@/lib/bigwig-utils';

interface ChooseBigWigSourceStepProps {
  experiment: Experiment;
  bigwigSource: BigWigSourceType;
  selectedAlignmentJobId: number | null;
  selectedNormalizationJobId: number | null;
  onSelectSource: (
    source: BigWigSourceType,
    jobId: number,
    alignmentJobId: number,
  ) => void;
  /** Whether to show a resolution warning when alignment is selected */
  showResolutionWarning?: boolean;
  /** Custom warning text for alignment fallback */
  alignmentWarningText?: string;
}

/**
 * Shared step component for Pearson and Heatmap wizards that lets users
 * choose between Roman-normalized bigWigs (preferred) and raw alignment
 * bigWigs (fallback). Replaces the old "Choose Alignment" step.
 */
export function ChooseBigWigSourceStep({
  experiment,
  bigwigSource,
  selectedAlignmentJobId,
  selectedNormalizationJobId,
  onSelectSource,
  showResolutionWarning = true,
  alignmentWarningText = 'These bigWig files are at 20bp resolution. The Pearson pipeline will extract signal at native 20bp resolution. For best results on mouse, run Roman Normalization first.',
}: ChooseBigWigSourceStepProps) {
  const { data: jobsData, isLoading } = useJobs(experiment.id, 1, 100);

  const allJobs: AnalysisJob[] = jobsData?.items ?? [];
  const normalizationJobs = allJobs.filter(
    (j) => j.jobType === 'roman_normalization' && j.status === 'complete',
  );
  const alignmentJobs = allJobs.filter(
    (j) => j.jobType === 'alignment' && j.status === 'complete',
  );

  const hasNormalization = normalizationJobs.length > 0;

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (alignmentJobs.length === 0 && normalizationJobs.length === 0) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-gray-500">
          No completed alignment or normalization runs available. Run an alignment first.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Normalization jobs (preferred) */}
      {hasNormalization && (
        <Card>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="text-sm font-semibold uppercase text-gray-500">
              Normalized BigWigs
            </h3>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
              Recommended
            </span>
          </div>
          <p className="mb-3 text-xs text-gray-500">
            Roman-normalized bigWigs at 50bp resolution. Preferred for accurate
            correlation and heatmap analysis.
          </p>
          <div className="space-y-2">
            {normalizationJobs.map((job) => {
              const parentAlignmentId =
                (job.params?.alignment_job_id as number) ?? null;
              return (
                <label
                  key={job.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                    bigwigSource === 'normalization' &&
                    selectedNormalizationJobId === job.id
                      ? 'border-primary bg-primary/5'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="bigwig-source"
                    checked={
                      bigwigSource === 'normalization' &&
                      selectedNormalizationJobId === job.id
                    }
                    onChange={() =>
                      onSelectSource('normalization', job.id, parentAlignmentId ?? 0)
                    }
                    className="text-primary"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-gray-800">{job.name}</span>
                    <span className="ml-3 text-xs text-gray-400">
                      {new Date(job.createdAt).toLocaleDateString()}
                    </span>
                    <span className="ml-2 text-xs text-green-600">50bp rnorm</span>
                  </div>
                </label>
              );
            })}
          </div>
        </Card>
      )}

      {/* Alignment jobs (fallback) */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase text-gray-500">
          {hasNormalization ? 'Alignment BigWigs (Fallback)' : 'Select an Alignment Run'}
        </h3>

        {showResolutionWarning && hasNormalization && bigwigSource === 'alignment' && (
          <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {alignmentWarningText}
          </div>
        )}

        <div className="space-y-2">
          {alignmentJobs.map((job) => (
            <label
              key={job.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                bigwigSource === 'alignment' && selectedAlignmentJobId === job.id
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="bigwig-source"
                checked={
                  bigwigSource === 'alignment' && selectedAlignmentJobId === job.id
                }
                onChange={() => onSelectSource('alignment', job.id, job.id)}
                className="text-primary"
              />
              <div className="flex-1">
                <span className="font-medium text-gray-800">{job.name}</span>
                <span className="ml-3 text-xs text-gray-400">
                  {new Date(job.createdAt).toLocaleDateString()}
                </span>
                <span className="ml-2 text-xs text-gray-400">20bp raw</span>
              </div>
            </label>
          ))}
        </div>
      </Card>
    </div>
  );
}

/**
 * Hook to resolve bigWig outputs based on the selected source.
 * Returns the appropriate outputs for building sample arrays.
 */
export function useBigWigOutputs(
  bigwigSource: BigWigSourceType,
  selectedAlignmentJobId: number | null,
  selectedNormalizationJobId: number | null,
): { data: JobOutput[] | undefined; fileCategory: 'bigwig' | 'normalization_bigwig' } {
  const alignmentOutputs = useJobOutputs(
    bigwigSource === 'alignment' ? selectedAlignmentJobId : null,
    'bigwig',
  );
  const normalizationOutputs = useJobOutputs(
    bigwigSource === 'normalization' ? selectedNormalizationJobId : null,
    'normalization_bigwig',
  );

  if (bigwigSource === 'normalization') {
    return { data: normalizationOutputs.data, fileCategory: 'normalization_bigwig' };
  }
  return { data: alignmentOutputs.data, fileCategory: 'bigwig' };
}
