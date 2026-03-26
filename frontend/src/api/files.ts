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

export async function downloadFile(
  experimentId: number,
  filePath: string,
  filename: string,
): Promise<void> {
  const response = await client.get(
    `/experiments/${experimentId}/files/download`,
    {
      params: { path: filePath },
      responseType: 'blob',
    },
  );
  const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function batchDownloadFiles(
  experimentId: number,
  paths: string[],
  filename: string,
): Promise<void> {
  const response = await client.post(
    `/experiments/${experimentId}/files/batch-download`,
    { paths },
    { responseType: 'blob' },
  );
  const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
