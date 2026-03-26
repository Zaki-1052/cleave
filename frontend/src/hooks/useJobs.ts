// frontend/src/hooks/useJobs.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as jobsApi from '@/api/jobs';
import type { JobCreatePayload } from '@/api/jobs';

export function useCreateJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      experimentId,
      payload,
    }: {
      experimentId: number;
      payload: JobCreatePayload;
    }) => jobsApi.createJob(experimentId, payload),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: ['jobs', job.experimentId] });
    },
  });
}

export function useJob(jobId: number | null) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobsApi.getJob(jobId!),
    enabled: jobId !== null,
    // Poll while job is still running
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'queued' || status === 'running') {
        return 2000;
      }
      return false;
    },
  });
}

export function useJobs(experimentId: number, page = 1, perPage = 25) {
  return useQuery({
    queryKey: ['jobs', experimentId, { page, perPage }],
    queryFn: () => jobsApi.listJobs(experimentId, page, perPage),
    enabled: !!experimentId,
  });
}
