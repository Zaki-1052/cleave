// frontend/src/components/experiments/AutoPipelineBanner.tsx
import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { cancelAutoPipeline, dismissAutoPipeline, retryAutoPipeline } from '@/api/autoPipeline';
import { useJobs } from '@/hooks/useJobs';
import type { AnalysisJob, Experiment } from '@/api/types';

interface AutoPipelineBannerProps {
  experiment: Experiment;
  onCancelled: () => void;
  onRetried: () => void;
  onDismissed: () => void;
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
  onRetried,
  onDismissed,
}: AutoPipelineBannerProps) {
  const status = experiment.autoPipelineStatus;
  const { data: jobsData } = useJobs(experiment.id, 1, 100);
  const [isRetrying, setIsRetrying] = useState(false);

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
    ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800'
    : isCancelled
      ? 'bg-muted border-border'
      : 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800';

  async function handleCancel() {
    try {
      await cancelAutoPipeline(experiment.id);
      onCancelled();
    } catch {
      // Error handled silently
    }
  }

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await retryAutoPipeline(experiment.id);
      onRetried();
    } catch {
      // Error handled silently
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleDismiss() {
    try {
      await dismissAutoPipeline(experiment.id);
      onDismissed();
    } catch {
      // Error handled silently
    }
  }

  return (
    <div className={`mb-4 rounded-lg border p-4 ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {isRunning && (
            <Spinner size="sm" />
          )}
          <span className="text-sm font-semibold text-foreground">
            {isPending && 'Auto-Pipeline: Waiting for FastQC...'}
            {isRunning && 'Auto-Pipeline Running'}
            {isError && 'Auto-Pipeline Paused (Error)'}
            {isCancelled && 'Auto-Pipeline Cancelled'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isError && (
            <Button variant="outlined" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? 'Retrying...' : 'Retry'}
            </Button>
          )}
          {isCancelled && (
            <Button variant="outlined" onClick={handleDismiss}>
              Dismiss
            </Button>
          )}
          {(isRunning || isPending) && (
            <Button variant="outlined" onClick={handleCancel}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {steps.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1">
          {steps.map((step, i) => (
            <div key={step.key} className="flex items-center">
              {i > 0 && (
                <div className="mx-1 h-px w-4 bg-border" />
              )}
              <div
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                  step.state === 'complete'
                    ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                    : step.state === 'running'
                      ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                      : step.state === 'error'
                        ? 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                        : step.state === 'queued'
                          ? 'bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400'
                          : 'bg-muted text-muted-foreground'
                }`}
              >
                {step.state === 'complete' && <Check className="h-3 w-3" />}
                {step.state === 'running' && (
                  <Spinner size="sm" className="text-blue-500" />
                )}
                {step.state === 'error' && <X className="h-3 w-3" />}
                {step.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
