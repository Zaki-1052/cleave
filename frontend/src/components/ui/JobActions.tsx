// frontend/src/components/ui/JobActions.tsx
import type { AnalysisJob } from '@/api/types';
import { useTerminateJob, useRetryJob } from '@/hooks/useJobs';
import { Button } from './Button';

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
        <Button
          variant="destructive"
          size="sm"
          onClick={handleTerminate}
          loading={terminateMutation.isPending}
        >
          Terminate
        </Button>
      )}
      {canRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleRetry}
          loading={retryMutation.isPending}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
