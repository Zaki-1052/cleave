// frontend/src/api/jobs.ts
import client from './client';
import type {
  AlignmentQCReport,
  AnalysisJob,
  JobOutput,
  PaginatedResponse,
  PeakCallingQCReport,
  QueueJob,
} from './types';

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

export async function getJobOutputs(
  jobId: number,
  category?: string,
): Promise<JobOutput[]> {
  const { data } = await client.get<JobOutput[]>(`/jobs/${jobId}/outputs`, {
    params: category ? { category } : undefined,
  });
  return data;
}

export async function getOutputSignedUrl(
  jobId: number,
  outputId: number,
): Promise<{ url: string; filename: string }> {
  const { data } = await client.get<{ url: string; filename: string }>(
    `/jobs/${jobId}/outputs/${outputId}/signed-url`,
  );
  return data;
}

export async function listAllJobs(
  page = 1,
  perPage = 25,
  status?: string,
  jobType?: string,
  search?: string,
): Promise<PaginatedResponse<QueueJob>> {
  const { data } = await client.get<PaginatedResponse<QueueJob>>('/jobs', {
    params: {
      page,
      perPage,
      ...(status && { status }),
      ...(jobType && { jobType }),
      ...(search && { search }),
    },
  });
  return data;
}

export async function updateJobNotes(
  jobId: number,
  notes: string | null,
): Promise<AnalysisJob> {
  const { data } = await client.patch<AnalysisJob>(`/jobs/${jobId}`, { notes });
  return data;
}

export async function batchDownloadJobFiles(
  jobId: number,
  outputIds: number[],
): Promise<void> {
  const response = await client.post(
    `/jobs/${jobId}/files/batch-download`,
    { outputIds },
    { responseType: 'blob' },
  );
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `job_${jobId}_files.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function getPeakCallingQCReport(jobId: number): Promise<PeakCallingQCReport> {
  const { data } = await client.get<PeakCallingQCReport>(`/jobs/${jobId}/peak-qc-report`);
  return data;
}

export async function downloadPeakCallingQCCsv(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/peak-qc-report/download`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'peak_caller_metrics.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadPeakAnnotationCsv(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/peak-qc-report/annotation-csv`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'peak_annotation.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
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
