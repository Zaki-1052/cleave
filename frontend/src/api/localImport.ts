// frontend/src/api/localImport.ts
import client from './client';
import type {
  RemoteFileEntry,
  ServerBrowseResponse,
  ImportFileProgress,
  ServerImportProgress,
} from './serverImport';

// Re-export shared types for convenience
export type { RemoteFileEntry, ServerBrowseResponse, ImportFileProgress, ServerImportProgress };

// --- Local import types ---

export interface LocalBrowseRequest {
  path: string;
}

export interface LocalImportRequest {
  filePaths: string[];
  useSymlink?: boolean;
}

export interface LocalImportStartedResponse {
  importId: string;
  fileCount: number;
  message: string;
}

// --- API Functions ---

export async function browseLocal(
  experimentId: number,
  req: LocalBrowseRequest,
): Promise<ServerBrowseResponse> {
  const { data } = await client.post<ServerBrowseResponse>(
    `/experiments/${experimentId}/local-import/browse`,
    req,
  );
  return data;
}

export async function startLocalImport(
  experimentId: number,
  req: LocalImportRequest,
): Promise<LocalImportStartedResponse> {
  const { data } = await client.post<LocalImportStartedResponse>(
    `/experiments/${experimentId}/local-import/start`,
    req,
  );
  return data;
}

export async function getLocalImportProgress(
  experimentId: number,
  importId: string,
): Promise<ServerImportProgress> {
  const { data } = await client.get<ServerImportProgress>(
    `/experiments/${experimentId}/local-import/${importId}/progress`,
  );
  return data;
}
