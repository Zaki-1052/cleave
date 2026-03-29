// frontend/src/api/serverImport.ts
import client from './client';

// --- Types ---

export interface ServerConnectRequest {
  protocol: 'ftp' | 'sftp';
  host: string;
  port?: number;
  username: string;
  password: string;
  path: string;
  savedServerId?: number;
}

export interface RemoteFileEntry {
  name: string;
  path: string;
  isDir: boolean;
  size: number | null;
}

export interface ServerBrowseResponse {
  currentPath: string;
  entries: RemoteFileEntry[];
}

export interface ServerImportRequest {
  protocol: 'ftp' | 'sftp';
  host: string;
  port?: number;
  username: string;
  password: string;
  filePaths: string[];
  saveServer?: boolean;
  serverName?: string;
}

export interface ServerImportStartedResponse {
  importId: string;
  fileCount: number;
  message: string;
}

export interface ImportFileProgress {
  remotePath: string;
  filename: string;
  status: 'pending' | 'downloading' | 'complete' | 'error';
  bytesDownloaded: number;
  bytesTotal: number | null;
  error: string | null;
}

export interface ServerImportProgress {
  importId: string;
  experimentId: number;
  userId: number;
  status: 'connecting' | 'downloading' | 'complete' | 'error';
  files: ImportFileProgress[];
  completedCount: number;
  totalCount: number;
  error: string | null;
}

export interface SavedServer {
  id: number;
  name: string;
  protocol: 'ftp' | 'sftp';
  host: string;
  port: number | null;
  username: string;
  defaultPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface SavedServerCreate {
  name: string;
  protocol: 'ftp' | 'sftp';
  host: string;
  port?: number;
  username: string;
  password: string;
  defaultPath?: string;
}

// --- API Functions ---

export async function browseServer(
  experimentId: number,
  req: ServerConnectRequest,
): Promise<ServerBrowseResponse> {
  const { data } = await client.post<ServerBrowseResponse>(
    `/experiments/${experimentId}/server-import/browse`,
    req,
  );
  return data;
}

export async function startImport(
  experimentId: number,
  req: ServerImportRequest,
): Promise<ServerImportStartedResponse> {
  const { data } = await client.post<ServerImportStartedResponse>(
    `/experiments/${experimentId}/server-import/start`,
    req,
  );
  return data;
}

export async function getImportProgress(
  experimentId: number,
  importId: string,
): Promise<ServerImportProgress> {
  const { data } = await client.get<ServerImportProgress>(
    `/experiments/${experimentId}/server-import/${importId}/progress`,
  );
  return data;
}

export async function listSavedServers(): Promise<SavedServer[]> {
  const { data } = await client.get<SavedServer[]>('/users/me/saved-servers');
  return data;
}

export async function createSavedServer(body: SavedServerCreate): Promise<SavedServer> {
  const { data } = await client.post<SavedServer>('/users/me/saved-servers', body);
  return data;
}

export async function deleteSavedServer(serverId: number): Promise<void> {
  await client.delete(`/users/me/saved-servers/${serverId}`);
}
