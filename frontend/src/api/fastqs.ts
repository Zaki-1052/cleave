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

export async function deleteFastq(
  experimentId: number,
  fastqId: number,
): Promise<void> {
  await client.delete(`/experiments/${experimentId}/fastqs/${fastqId}`);
}
