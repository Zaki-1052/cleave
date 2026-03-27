// frontend/src/api/jobs.ts
import client from './client';
import type { AlignmentQCReport, AnalysisJob, PaginatedResponse } from './types';

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

export async function getQCReport(jobId: number): Promise<AlignmentQCReport> {
  const { data } = await client.get<AlignmentQCReport>(`/jobs/${jobId}/qc-report`);
  return data;
}

export async function downloadQCCsv(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/qc-report/download`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'alignment_metrics.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
