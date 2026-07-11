// frontend/src/components/experiments/AutoPipelineBanner.tsx
import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { cancelAutoPipeline, dismissAutoPipeline, retryAutoPipeline } from '@/api/autoPipeline';
import { useJobs } from '@/hooks/useJobs';
import { cn } from '@/lib/cn';
import type { AnalysisJob, Experiment } from '@/api/types';

interface AutoPipelineBannerProps {
  experiment: Experiment;
  onCancelled: () => void;
  onRetried: () => void;
  onDismissed: () => void;
}

const STEP_ORDER: Record<string, number> = {
  // CUT&RUN / CUT&Tag
  trimming: 1,
  alignment: 2,
  peak_calling: 3,
  roman_normalization: 4,
  diffbind: 5,
  custom_heatmap: 6,
  pearson_correlation: 7,
  // RNA-seq
  rnaseq_trimming: 1,
  rnaseq_alignment: 2,
  rnaseq_qc: 3,
  rnaseq_de: 4,
};

const STEP_LABELS: Record<string, string> = {
  // CUT&RUN / CUT&Tag
  trimming: 'Trimming',
  alignment: 'Alignment',
  peak_calling: 'Peak Calling',
  roman_normalization: 'Normalization',
  diffbind: 'DiffBind',
  custom_heatmap: 'Heatmaps',
  pearson_correlation: 'Pearson',
  // RNA-seq
  rnaseq_trimming: 'Trimming (fastp)',
  rnaseq_alignment: 'Alignment (STAR+Salmon)',
  rnaseq_qc: 'QC Dashboard',
  rnaseq_de: 'DE Analysis',
};

type StepState = 'complete' | 'running' | 'queued' | 'error' | 'pending';

// Status-token tints mirroring StatusBadge, keyed by step state.
const STEP_TINTS: Record<StepState, string> = {
  complete: 'bg-status-complete/10 text-status-complete-foreground ring-status-complete/25',
  running: 'bg-status-running/10 text-status-running-foreground ring-status-running/30',
  queued: 'bg-status-queued/10 text-status-queued-foreground ring-status-queued/25',
  error: 'bg-status-error/10 text-status-error-foreground ring-status-error/30',
  pending: 'bg-muted text-muted-foreground ring-border',
};

export function AutoPipelineBanner({
  experiment,
  onCancelled,
  onRetried,
  onDismissed,
}: AutoPipelineBannerProps) {
  const status = experiment.autoPipelineStatus;
  const { data: jobsData } = useJobs(experiment.id, 1, 100);
  const [isRetrying, setIsRetrying] = useState(false);
  const queryClient = useQueryClient();

  const autoJobs = useMemo(() => {
    const jobs: AnalysisJob[] = jobsData?.items ?? [];
    return jobs
      .filter((j) => j.autoPipeline)
      .sort((a, b) => (STEP_ORDER[a.jobType] ?? 99) - (STEP_ORDER[b.jobType] ?? 99));
  }, [jobsData]);

  const steps = useMemo(() => {
    const config = experiment.autoPipelineConfig ?? {};
    const isRnaseq = experiment.assayType === 'RNA-seq';

    const allSteps = isRnaseq
      ? [
          { key: 'rnaseq_trimming', always: false },
          { key: 'rnaseq_alignment', always: true },
          { key: 'rnaseq_qc', always: false },
          { key: 'rnaseq_de', always: false },
        ]
      : [
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
        if (s.key === 'rnaseq_qc') return config.include_qc;
        if (s.key === 'rnaseq_de') return config.include_de;
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
  }, [autoJobs, experiment.autoPipelineConfig, experiment.assayType]);

  if (!status || status === 'complete') return null;

  const isRunning = status === 'running';
  const isError = status === 'error';
  const isCancelled = status === 'cancelled';
  const isPending = status === 'pending_fastqc';

  const bgColor = isError
    ? 'border-destructive/30 bg-destructive/10 border-l-2 border-l-destructive'
    : isCancelled
      ? 'border-border bg-muted'
      : 'border-info/25 bg-info/10 border-l-2 border-l-primary';

  async function handleCancel() {
    try {
      await cancelAutoPipeline(experiment.id);
      onCancelled();
      toast.success('Auto-pipeline cancelled');
    } catch {
      toast.error('Failed to cancel auto-pipeline');
    }
  }

  async function handleRetry() {
    setIsRetrying(true);
    try {
      await retryAutoPipeline(experiment.id);
      // Invalidate jobs queries so the retried job shows up in the queue immediately
      void queryClient.invalidateQueries({ queryKey: ['jobs', experiment.id] });
      void queryClient.invalidateQueries({ queryKey: ['all-jobs'] });
      onRetried();
      toast.success('Auto-pipeline step retried');
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to retry auto-pipeline';
      toast.error(msg);
    } finally {
      setIsRetrying(false);
    }
  }

  async function handleDismiss() {
    try {
      await dismissAutoPipeline(experiment.id);
      onDismissed();
    } catch {
      toast.error('Failed to dismiss auto-pipeline');
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
            <Button variant="outline" onClick={handleRetry} disabled={isRetrying}>
              {isRetrying ? 'Retrying...' : 'Retry'}
            </Button>
          )}
          {isCancelled && (
            <Button variant="outline" onClick={handleDismiss}>
              Dismiss
            </Button>
          )}
          {(isRunning || isPending) && (
            <Button variant="outline" onClick={handleCancel}>
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
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wide ring-1 ring-inset',
                  STEP_TINTS[step.state],
                )}
              >
                {step.state === 'complete' && <Check className="h-3 w-3" />}
                {step.state === 'running' && (
                  <Spinner size="sm" className="h-3 w-3 text-status-running-foreground" />
                )}
                {step.state === 'error' && <X className="h-3 w-3" />}
                {step.label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
