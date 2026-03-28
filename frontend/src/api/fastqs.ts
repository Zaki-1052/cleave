// frontend/src/api/fastqs.ts
import client from './client';
import type { FastqFile, PaginatedResponse } from './types';

export interface FastqUploadResponse {
  uploaded: FastqFile[];
  totalBytes: number;
  fileCount: number;
}

export async function getFastqs(
  experimentId: number,
  page = 1,
  perPage = 25,
): Promise<PaginatedResponse<FastqFile>> {
  const { data } = await client.get<PaginatedResponse<FastqFile>>(
    `/experiments/${experimentId}/fastqs`,
    { params: { page, perPage } },
  );
  return data;
}

export async function uploadFastqs(
  experimentId: number,
  files: File[],
  onProgress?: (percent: number) => void,
): Promise<FastqUploadResponse> {
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  const { data } = await client.post<FastqUploadResponse>(
    `/experiments/${experimentId}/fastqs/upload`,
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded * 100) / event.total));
        }
      },
    },
  );
  return data;
}

export function getFastqcReportUrl(experimentId: number, fastqId: number): string {
  return `/api/v1/experiments/${experimentId}/fastqs/${fastqId}/fastqc`;
}

export async function getFastqcSignedUrl(experimentId: number, fastqId: number): Promise<string> {
  const { data } = await client.get<{ url: string }>(
    `/experiments/${experimentId}/fastqs/${fastqId}/fastqc-token`,
  );
  return data.url;
}

export interface FastqcModuleSummary {
  name: string;
  status: string;
}

export interface FastqcSummaryResponse {
  filename: string;
  totalReads: number | null;
  moduleSummaries: FastqcModuleSummary[];
}

export async function getFastqcSummary(
  experimentId: number,
  fastqId: number,
): Promise<FastqcSummaryResponse> {
  const { data } = await client.get<FastqcSummaryResponse>(
    `/experiments/${experimentId}/fastqs/${fastqId}/fastqc-summary`,
  );
  return data;
}

export async function deleteFastq(
  experimentId: number,
  fastqId: number,
): Promise<void> {
  await client.delete(`/experiments/${experimentId}/fastqs/${fastqId}`);
}
