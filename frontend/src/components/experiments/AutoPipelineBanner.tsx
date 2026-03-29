// frontend/src/components/experiments/AutoPipelineBanner.tsx
import { useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { cancelAutoPipeline } from '@/api/autoPipeline';
import { useJobs } from '@/hooks/useJobs';
import type { AnalysisJob, Experiment } from '@/api/types';

interface AutoPipelineBannerProps {
  experiment: Experiment;
  onCancelled: () => void;
}

const STEP_ORDER: Record<string, number> = {
  trimming: 1,
  alignment: 2,
  peak_calling: 3,
  roman_normalization: 4,
  diffbind: 5,
  custom_heatmap: 6,
  pearson_correlation: 7,
};

const STEP_LABELS: Record<string, string> = {
  trimming: 'Trimming',
  alignment: 'Alignment',
  peak_calling: 'Peak Calling',
  roman_normalization: 'Normalization',
  diffbind: 'DiffBind',
  custom_heatmap: 'Heatmaps',
  pearson_correlation: 'Pearson',
};

type StepState = 'complete' | 'running' | 'queued' | 'error' | 'pending';

export function AutoPipelineBanner({
  experiment,
  onCancelled,
}: AutoPipelineBannerProps) {
  const status = experiment.autoPipelineStatus;
  const { data: jobsData } = useJobs(experiment.id, 1, 100);

  const autoJobs = useMemo(() => {
    const jobs: AnalysisJob[] = jobsData?.items ?? [];
    return jobs
      .filter((j) => j.autoPipeline)
      .sort((a, b) => (STEP_ORDER[a.jobType] ?? 99) - (STEP_ORDER[b.jobType] ?? 99));
  }, [jobsData]);

  const steps = useMemo(() => {
    const config = experiment.autoPipelineConfig ?? {};
    const allSteps = [
      { key: 'trimming', always: false },
      { key: 'alignment', always: true },
      { key: 'peak_calling', always: true },
      { key: 'roman_normalization', always: false },
      { key: 'diffbind', always: false },
      { key: 'custom_heatmap', always: false },
      { key: 'pearson_correlation', always: false },
    ];

    return allSteps
      .filter((s) => {
        if (s.always) return true;
        const job = autoJobs.find((j) => j.jobType === s.key);
        if (job) return true;
        // Check config for inclusion
        if (s.key === 'roman_normalization') return config.include_normalization;
        if (s.key === 'diffbind') return config.include_diffbind;
        if (s.key === 'custom_heatmap') return config.include_heatmap;
        if (s.key === 'pearson_correlation') return config.include_pearson;
        return true;
      })
      .map((s) => {
        const job = autoJobs.find((j) => j.jobType === s.key);
        let state: StepState = 'pending';
        if (job) {
          if (job.status === 'complete') state = 'complete';
          else if (job.status === 'running') state = 'running';
          else if (job.status === 'error') state = 'error';
          else if (job.status === 'queued') state = 'queued';
        }
        return {
          key: s.key,
          label: STEP_LABELS[s.key] ?? s.key,
          state,
        };
      });
  }, [autoJobs, experiment.autoPipelineConfig]);

  if (!status || status === 'complete') return null;

  const isRunning = status === 'running';
  const isError = status === 'error';
  const isCancelled = status === 'cancelled';
  const isPending = status === 'pending_fastqc';

  const bgColor = isError
    ? 'bg-red-50 border-red-200'
    : isCancelled
      ? 'bg-gray-50 border-gray-200'
      : 'bg-blue-50 border-blue-200';

  async function handleCancel() {
    try {
      await cancelAutoPipeline(experiment.id);
      onCancelled();
    } catch {
      // Error handled silently
    }
  }

  return (
    <div className={`mb-4 rounded-lg border p-4 ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRunning && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          )}
          <span className="text-sm font-semibold text-gray-800">
            {isPending && 'Auto-Pipeline: Waiting for FastQC...'}
            {isRunning && 'Auto-Pipeline Running'}
            {isError && 'Auto-Pipeline Paused (Error)'}
            {isCancelled && 'Auto-Pipeline Cancelled'}
          </span>
        </div>
        {(isRunning || isPending) && (
          <Button variant="outlined" onClick={handleCancel}>
            Cancel
          </Button>
        )}
      </div>

      {steps.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {steps.map((step, i) => (
            <div key={step.key} className="flex items-center">
              {i > 0 && (
                <div className="mx-1 h-px w-4 bg-gray-300" />
              )}
              <div
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  step.state === 'complete'
                    ? 'bg-green-100 text-green-700'
                    : step.state === 'running'
                      ? 'bg-blue-100 text-blue-700'
                      : step.state === 'error'
                        ? 'bg-red-100 text-red-700'
                        : step.state === 'queued'
                          ? 'bg-amber-50 text-amber-600'
                          : 'bg-gray-100 text-gray-500'
                }`}
              >
                {step.state === 'complete' && <span>&#10003;</span>}
                {step.state === 'running' && (
                  <div className="h-3 w-3 animate-spin rounded-full border border-blue-500 border-t-transparent" />
                )}
                {step.state === 'error' && <span>&#10007;</span>}
                {step.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
