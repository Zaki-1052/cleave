// frontend/src/api/jobs.ts
import client from './client';
import type {
  AlignmentQCReport,
  AnalysisJob,
  CustomHeatmapReport,
  DiffBindReport,
  JobOutput,
  PaginatedResponse,
  PeakCallingQCReport,
  PathwayReport,
  PearsonCorrelationReport,
  QueueJob,
  RnaseqAlignmentQCReport,
  RnaseqDEReport,
  RnaseqQCDashboardReport,
  RomanNormalizationReport,
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

export async function downloadTopPeaksCsv(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/peak-qc-report/top-peaks-csv`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'top_called_peaks.csv';
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

// ---------------------------------------------------------------------------
// DiffBind
// ---------------------------------------------------------------------------

export async function getDiffBindReport(jobId: number): Promise<DiffBindReport> {
  const { data } = await client.get<DiffBindReport>(`/jobs/${jobId}/diffbind-report`);
  return data;
}

function _downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadDiffBindResults(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/diffbind-report/download-results`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'diffbind_results.txt');
}

export async function downloadDiffBindCounts(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/diffbind-report/download-counts`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'normalized_counts.csv');
}

// ---------------------------------------------------------------------------
// RNA-seq Alignment QC
// ---------------------------------------------------------------------------

export async function getRnaseqQCReport(jobId: number): Promise<RnaseqAlignmentQCReport> {
  const { data } = await client.get<RnaseqAlignmentQCReport>(
    `/jobs/${jobId}/rnaseq-qc-report`,
  );
  return data;
}

export async function downloadRnaseqQCCsv(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/rnaseq-qc-report/download`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'rnaseq_alignment_metrics.csv');
}

// ---------------------------------------------------------------------------
// RNA-seq DE Analysis (DESeq2)
// ---------------------------------------------------------------------------

export async function getRnaseqDEReport(jobId: number): Promise<RnaseqDEReport> {
  const { data } = await client.get<RnaseqDEReport>(
    `/jobs/${jobId}/rnaseq-de-report`,
  );
  return data;
}

export async function downloadRnaseqDEResults(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/rnaseq-de-report/download-results`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'de_results.tsv');
}

export async function downloadRnaseqDECounts(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/rnaseq-de-report/download-counts`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'normalized_counts.csv');
}

// ---------------------------------------------------------------------------
// Pathway Analysis (clusterProfiler)
// ---------------------------------------------------------------------------

export async function getPathwayReport(jobId: number): Promise<PathwayReport> {
  const { data } = await client.get<PathwayReport>(
    `/jobs/${jobId}/pathway-report`,
  );
  return data;
}

export async function downloadPathwayGOResults(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/pathway-report/download-go`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'go_results.csv');
}

export async function downloadPathwayKEGGResults(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/pathway-report/download-kegg`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'kegg_results.csv');
}

export async function downloadPathwayGeneList(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/pathway-report/download-gene-list`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'gene_list.tsv');
}

// ---------------------------------------------------------------------------
// RSeQC + MultiQC QC Dashboard
// ---------------------------------------------------------------------------

export async function getRnaseqQCDashboardReport(jobId: number): Promise<RnaseqQCDashboardReport> {
  const { data } = await client.get<RnaseqQCDashboardReport>(
    `/jobs/${jobId}/rnaseq-qc-dashboard-report`,
  );
  return data;
}

export async function downloadRnaseqQCDashboardCsv(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/rnaseq-qc-dashboard-report/download`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, `rnaseq-qc-metrics-${jobId}.csv`);
}

// ---------------------------------------------------------------------------
// Custom Heatmaps
// ---------------------------------------------------------------------------

export async function getCustomHeatmapReport(jobId: number): Promise<CustomHeatmapReport> {
  const { data } = await client.get<CustomHeatmapReport>(`/jobs/${jobId}/heatmap-report`);
  return data;
}

export async function downloadHeatmapMatrix(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/heatmap-report/download-matrix`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'heatmap_matrix.gz');
}

export async function uploadBedFile(
  experimentId: number,
  file: File,
): Promise<{ path: string; filename: string; lineCount: number }> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await client.post(
    `/experiments/${experimentId}/upload-bed`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  );
  return data;
}

// ---------------------------------------------------------------------------
// Pearson Correlation
// ---------------------------------------------------------------------------

export async function getPearsonCorrelationReport(jobId: number): Promise<PearsonCorrelationReport> {
  const { data } = await client.get<PearsonCorrelationReport>(`/jobs/${jobId}/pearson-report`);
  return data;
}

export async function downloadPearsonCorrelation(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/pearson-report/download-correlation`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'pearson_correlation.csv');
}

export async function downloadPearsonCoverage(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/pearson-report/download-coverage`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'pearson_coverage_matrix.csv');
}

// ---------------------------------------------------------------------------
// Roman Normalization
// ---------------------------------------------------------------------------

export async function getRomanNormalizationReport(jobId: number): Promise<RomanNormalizationReport> {
  const { data } = await client.get<RomanNormalizationReport>(`/jobs/${jobId}/normalization-report`);
  return data;
}

export async function downloadNormalizationFactors(jobId: number): Promise<void> {
  const response = await client.get(`/jobs/${jobId}/normalization-report/download-factors`, {
    responseType: 'blob',
  });
  _downloadBlob(response.data as Blob, 'normalization_factors.csv');
}

// ---------------------------------------------------------------------------
// Job Management (Terminate / Retry / Log Tail)
// ---------------------------------------------------------------------------

export async function terminateJob(jobId: number): Promise<AnalysisJob> {
  const { data } = await client.post<AnalysisJob>(`/jobs/${jobId}/terminate`);
  return data;
}

export async function retryJob(jobId: number): Promise<AnalysisJob> {
  const { data } = await client.post<AnalysisJob>(`/jobs/${jobId}/retry`);
  return data;
}

export async function getJobLogTail(
  jobId: number,
  lines = 50,
): Promise<{ logTail: string; totalLines: number }> {
  const { data } = await client.get<{ logTail: string; totalLines: number }>(
    `/jobs/${jobId}/log-tail`,
    { params: { lines } },
  );
  return data;
}
