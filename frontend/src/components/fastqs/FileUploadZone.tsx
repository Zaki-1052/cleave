// frontend/src/components/fastqs/FileUploadZone.tsx
import { useCallback, useRef, useState, type DragEvent } from 'react';
import axios from 'axios';
import * as tus from 'tus-js-client';
import { X, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getAccessToken, setAccessToken } from '@/api/client';
import { formatBytes } from '@/lib/utils';

const VALID_EXTENSIONS = ['.fastq.gz', '.fastq', '.fq.gz', '.fq'];
const TUS_CHUNK_SIZE = 100 * 1024 * 1024; // 100 MB chunks
const MAX_CONCURRENT_UPLOADS = 2;

function hasValidExtension(name: string): boolean {
  return VALID_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

interface FileUploadState {
  file: File;
  status: 'staged' | 'uploading' | 'complete' | 'error';
  progress: number;
  error?: string;
  tusUpload?: tus.Upload;
}

interface FileUploadZoneProps {
  experimentId: number;
  onUploadComplete: () => void;
}

export function FileUploadZone({ experimentId, onUploadComplete }: FileUploadZoneProps) {
  const [fileStates, setFileStates] = useState<FileUploadState[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = fileStates.some((f) => f.status === 'uploading');

  function addFiles(incoming: FileList | File[]) {
    const valid: File[] = [];
    const rejected: string[] = [];

    for (const file of Array.from(incoming)) {
      if (hasValidExtension(file.name)) {
        valid.push(file);
      } else {
        rejected.push(file.name);
      }
    }

    if (rejected.length > 0) {
      setUploadError(
        `Invalid file format: ${rejected.join(', ')}. Accepted: .fastq.gz, .fastq, .fq.gz, .fq`,
      );
    } else {
      setUploadError(null);
    }

    if (valid.length > 0) {
      const newStates: FileUploadState[] = valid.map((file) => ({
        file,
        status: 'staged',
        progress: 0,
      }));
      setFileStates((prev) => [...prev, ...newStates]);
    }
  }

  function handleDragOver(e: DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    addFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      addFiles(e.target.files);
    }
    e.target.value = '';
  }

  function removeFile(index: number) {
    setFileStates((prev) => {
      const state = prev[index];
      if (state?.tusUpload) {
        state.tusUpload.abort();
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  const handleUpload = useCallback(async () => {
    const stagedEntries = fileStates
      .map((f, i) => ({ idx: i, file: f.file }))
      .filter((_, i) => fileStates[i]?.status === 'staged');

    if (stagedEntries.length === 0) return;
    setUploadError(null);

    // Proactively refresh token to ensure fresh 30-min window for upload
    try {
      const res = await axios.post('/api/v1/auth/refresh', {});
      setAccessToken(res.data.accessToken);
    } catch {
      // Continue with existing token — may still be valid
    }

    let completedCount = 0;
    const totalFiles = stagedEntries.length;
    const queue = [...stagedEntries];

    function startNext() {
      const entry = queue.shift();
      if (!entry) return;
      const { idx, file } = entry;

      const upload = new tus.Upload(file, {
        endpoint: '/api/v1/tus',
        chunkSize: TUS_CHUNK_SIZE,
        retryDelays: [0, 1000, 3000, 5000, 10000, 30000],
        metadata: {
          experiment_id: String(experimentId),
          filename: file.name,
          filetype: 'application/octet-stream',
        },
        headers: {},
        onBeforeRequest: (req) => {
          const token = getAccessToken();
          if (token) {
            req.setHeader('Authorization', `Bearer ${token}`);
          }
        },
        onAfterResponse: async (_req, res) => {
          // Refresh token on 401 so the next retry uses a valid token
          if (res.getStatus() === 401) {
            try {
              const refreshRes = await axios.post('/api/v1/auth/refresh', {});
              setAccessToken(refreshRes.data.accessToken);
            } catch {
              // Refresh failed — will error out after retries exhausted
            }
          }
        },
        onShouldRetry: (err, retryAttempt) => {
          const status = err.originalResponse ? err.originalResponse.getStatus() : 0;
          // Allow one retry on 401 after token refresh
          if (status === 401) return retryAttempt < 1;
          // Default: retry network errors and 5xx server errors
          return status === 0 || status >= 500;
        },
        onProgress: (bytesUploaded, bytesTotal) => {
          const percent = Math.round((bytesUploaded / bytesTotal) * 100);
          setFileStates((prev) =>
            prev.map((f, i) => (i === idx ? { ...f, progress: percent } : f)),
          );
        },
        onSuccess: () => {
          setFileStates((prev) =>
            prev.map((f, i) => (i === idx ? { ...f, status: 'complete', progress: 100 } : f)),
          );
          onUploadDone();
        },
        onError: (error) => {
          setFileStates((prev) =>
            prev.map((f, i) =>
              i === idx ? { ...f, status: 'error', error: error.message } : f,
            ),
          );
          onUploadDone();
        },
      });

      setFileStates((prev) =>
        prev.map((f, i) => (i === idx ? { ...f, status: 'uploading', tusUpload: upload } : f)),
      );

      upload.start();
    }

    function onUploadDone() {
      completedCount++;
      if (queue.length > 0) startNext();
      if (completedCount === totalFiles) onUploadComplete();
    }

    const initialBatch = Math.min(MAX_CONCURRENT_UPLOADS, stagedEntries.length);
    for (let i = 0; i < initialBatch; i++) {
      startNext();
    }
  }, [fileStates, experimentId, onUploadComplete]);

  const stagedFiles = fileStates.filter((f) => f.status === 'staged');
  const totalStagedSize = stagedFiles.reduce((sum, f) => sum + f.file.size, 0);
  const overallProgress =
    fileStates.length > 0
      ? Math.round(fileStates.reduce((sum, f) => sum + f.progress, 0) / fileStates.length)
      : 0;

  return (
    <div className="mb-4">
      {uploadError && (
        <div className="mb-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {uploadError}
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragOver
            ? 'border-primary bg-primary/5'
            : 'border-primary/40'
        }`}
      >
        <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Drag & Drop or{' '}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer font-medium text-primary hover:underline"
          >
            Browse
          </button>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          .fastq.gz, .fastq, .fq.gz, .fq
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".fastq,.fastq.gz,.fq,.fq.gz,.gz"
          onChange={handleFileInput}
          className="hidden"
          aria-label="Select FASTQ files"
        />
      </div>

      {fileStates.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {fileStates.length} file{fileStates.length !== 1 ? 's' : ''}{' '}
            {stagedFiles.length > 0 && <span className="font-mono">({formatBytes(totalStagedSize)})</span>}
          </div>
          <div className="max-h-48 overflow-y-auto rounded border border-border">
            {fileStates.map((fs, i) => (
              <div
                key={`${fs.file.name}-${i}`}
                className="flex items-center justify-between border-b border-border px-3 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm text-foreground">{fs.file.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{formatBytes(fs.file.size)}</span>
                  {fs.status === 'complete' && (
                    <span className="ml-2 text-xs text-green-600">Done</span>
                  )}
                  {fs.status === 'error' && (
                    <span className="ml-2 text-xs text-red-600">{fs.error || 'Failed'}</span>
                  )}
                  {fs.status === 'uploading' && (
                    <span className="ml-2 font-mono text-xs text-primary">{fs.progress}%</span>
                  )}
                </div>
                {fs.status === 'uploading' && (
                  <div className="mx-2 h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${fs.progress}%` }}
                    />
                  </div>
                )}
                {(fs.status === 'staged' || fs.status === 'error') && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-2 text-muted-foreground hover:text-red-500"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {fs.status === 'uploading' && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-2 text-xs text-muted-foreground hover:text-red-500"
                    title="Cancel upload"
                  >
                    Cancel
                  </button>
                )}
              </div>
            ))}
          </div>

          {isUploading && (
            <div className="mt-2">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{overallProgress}% overall</p>
            </div>
          )}

          <div className="mt-3">
            <Button
              onClick={handleUpload}
              disabled={isUploading || stagedFiles.length === 0}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
