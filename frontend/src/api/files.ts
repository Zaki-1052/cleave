// frontend/src/api/files.ts
import client from './client';
import type { FileTreeResponse } from './types';

export async function getExperimentFiles(
  experimentId: number,
): Promise<FileTreeResponse> {
  const res = await client.get<FileTreeResponse>(
    `/experiments/${experimentId}/files`,
  );
  return res.data;
}

interface DownloadTokenResponse {
  url: string;
}

export async function downloadFile(
  experimentId: number,
  filePath: string,
): Promise<void> {
  const { data } = await client.post<DownloadTokenResponse>(
    '/files/download-token',
    { experimentId, path: filePath },
  );
  window.location.href = data.url;
}

export async function batchDownloadFiles(
  experimentId: number,
  paths: string[],
): Promise<void> {
  const { data } = await client.post<DownloadTokenResponse>(
    '/files/download-token',
    { experimentId, paths },
  );
  window.location.href = data.url;
}
