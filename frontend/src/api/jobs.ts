// frontend/src/api/jobs.ts
import client from './client';
import type { AnalysisJob, PaginatedResponse } from './types';

export interface JobCreatePayload {
  jobType: string;
  name: string;
  notes?: string | null;
  params?: Record<string, unknown>;
  parentJobId?: number | null;
}

export async function createJob(
  experimentId: number,
  payload: JobCreatePayload,
): Promise<AnalysisJob> {
  const { data } = await client.post<AnalysisJob>(
    `/experiments/${experimentId}/jobs`,
    payload,
  );
  return data;
}

export async function getJob(jobId: number): Promise<AnalysisJob> {
  const { data } = await client.get<AnalysisJob>(`/jobs/${jobId}`);
  return data;
}

export async function listJobs(
  experimentId: number,
  page = 1,
  perPage = 25,
): Promise<PaginatedResponse<AnalysisJob>> {
  const { data } = await client.get<PaginatedResponse<AnalysisJob>>(
    `/experiments/${experimentId}/jobs`,
    { params: { page, perPage } },
  );
  return data;
}
