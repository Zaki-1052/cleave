// frontend/src/components/ui/JobActions.tsx — terminate/retry controls for a job.
import { useState } from 'react';
import { toast } from 'sonner';
import type { AnalysisJob } from '@/api/types';
import { useTerminateJob, useRetryJob } from '@/hooks/useJobs';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';

interface Props {
  job: AnalysisJob;
  onRetrySuccess?: (newJob: AnalysisJob) => void;
}

export default function JobActions({ job, onRetrySuccess }: Props) {
  const terminateMutation = useTerminateJob();
  const retryMutation = useRetryJob();
  const [confirmTerminate, setConfirmTerminate] = useState(false);

  const canTerminate = job.status === 'queued' || job.status === 'running';
  const canRetry = job.status === 'error' || job.status === 'terminated';

  if (!canTerminate && !canRetry) return null;

  const handleTerminate = () => {
    terminateMutation.mutate(job.id, {
      onSuccess: () => {
        setConfirmTerminate(false);
        toast.success('Job terminated');
      },
      onError: () => {
        setConfirmTerminate(false);
        toast.error('Failed to terminate job');
      },
    });
  };

  const handleRetry = () => {
    retryMutation.mutate(job.id, {
      onSuccess: (newJob) => {
        toast.success('Job re-queued');
        onRetrySuccess?.(newJob);
      },
      onError: () => toast.error('Failed to retry job'),
    });
  };

  return (
    <div className="flex items-center gap-2">
      {canTerminate && (
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setConfirmTerminate(true)}
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
      <ConfirmDialog
        open={confirmTerminate}
        onOpenChange={setConfirmTerminate}
        title="Terminate job?"
        description={`"${job.name}" will be stopped. This cannot be undone.`}
        confirmLabel="Terminate"
        variant="destructive"
        loading={terminateMutation.isPending}
        onConfirm={handleTerminate}
      />
    </div>
  );
}
