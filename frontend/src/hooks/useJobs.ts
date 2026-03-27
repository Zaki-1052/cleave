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
  });
}

export function useJobs(experimentId: number, page = 1, perPage = 25) {
  return useQuery({
    queryKey: ['jobs', experimentId, { page, perPage }],
    queryFn: () => jobsApi.listJobs(experimentId, page, perPage),
    enabled: !!experimentId,
  });
}

export function useAllJobs(
  page = 1,
  perPage = 25,
  status?: string,
  jobType?: string,
  search?: string,
) {
  return useQuery({
    queryKey: ['all-jobs', { page, perPage, status, jobType, search }],
    queryFn: () => jobsApi.listAllJobs(page, perPage, status, jobType, search),
  });
}

export function useUpdateJobNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, notes }: { jobId: number; notes: string | null }) =>
      jobsApi.updateJobNotes(jobId, notes),
    onSuccess: (job) => {
      void queryClient.invalidateQueries({ queryKey: ['job', job.id] });
    },
  });
}

export function useQCReport(jobId: number | null) {
  return useQuery({
    queryKey: ['qc-report', jobId],
    queryFn: () => jobsApi.getQCReport(jobId!),
    enabled: jobId !== null,
  });
}

export function useJobOutputs(jobId: number | null, category?: string) {
  return useQuery({
    queryKey: ['job-outputs', jobId, category],
    queryFn: () => jobsApi.getJobOutputs(jobId!, category),
    enabled: jobId !== null,
  });
}
