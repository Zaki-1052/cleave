// frontend/src/components/ui/JobActions.tsx
import type { AnalysisJob } from '@/api/types';
import { useTerminateJob, useRetryJob } from '@/hooks/useJobs';

interface Props {
  job: AnalysisJob;
  onRetrySuccess?: (newJob: AnalysisJob) => void;
}

export default function JobActions({ job, onRetrySuccess }: Props) {
  const terminateMutation = useTerminateJob();
  const retryMutation = useRetryJob();

  const canTerminate = job.status === 'queued' || job.status === 'running';
  const canRetry = job.status === 'error' || job.status === 'terminated';

  if (!canTerminate && !canRetry) return null;

  const handleTerminate = () => {
    if (!window.confirm(`Terminate job "${job.name}"? This cannot be undone.`)) return;
    terminateMutation.mutate(job.id);
  };

  const handleRetry = () => {
    retryMutation.mutate(job.id, {
      onSuccess: (newJob) => {
        onRetrySuccess?.(newJob);
      },
    });
  };

  return (
    <div className="flex items-center gap-2">
      {canTerminate && (
        <button
          type="button"
          onClick={handleTerminate}
          disabled={terminateMutation.isPending}
          className="rounded-full border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          {terminateMutation.isPending ? 'Terminating...' : 'Terminate'}
        </button>
      )}
      {canRetry && (
        <button
          type="button"
          onClick={handleRetry}
          disabled={retryMutation.isPending}
          className="rounded-full border border-primary px-3 py-1 text-xs font-medium text-primary hover:bg-blue-50 disabled:opacity-50"
        >
          {retryMutation.isPending ? 'Retrying...' : 'Retry'}
        </button>
      )}
    </div>
  );
}
