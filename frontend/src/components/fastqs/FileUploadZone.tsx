// frontend/src/components/fastqs/FileUploadZone.tsx
import { useCallback, useRef, useState, type DragEvent } from 'react';
import * as tus from 'tus-js-client';
import { Button } from '@/components/ui/Button';
import { getAccessToken } from '@/api/client';
import { formatBytes } from '@/lib/utils';

const VALID_EXTENSIONS = ['.fastq.gz', '.fastq', '.fq.gz', '.fq'];
const TUS_CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB chunks

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
      if (state.tusUpload) {
        state.tusUpload.abort();
      }
      return prev.filter((_, i) => i !== index);
    });
  }

  const handleUpload = useCallback(async () => {
    const stagedIndices = fileStates
      .map((f, i) => (f.status === 'staged' ? i : -1))
      .filter((i) => i !== -1);

    if (stagedIndices.length === 0) return;
    setUploadError(null);

    let completedCount = 0;
    const totalFiles = stagedIndices.length;

    function checkAllComplete() {
      completedCount++;
      if (completedCount === totalFiles) {
        onUploadComplete();
      }
    }

    for (const idx of stagedIndices) {
      const fileState = fileStates[idx];

      const upload = new tus.Upload(fileState.file, {
        endpoint: '/api/v1/tus',
        chunkSize: TUS_CHUNK_SIZE,
        retryDelays: [0, 1000, 3000, 5000],
        metadata: {
          experiment_id: String(experimentId),
          filename: fileState.file.name,
        },
        headers: {},
        onBeforeRequest: (req) => {
          const token = getAccessToken();
          if (token) {
            req.setHeader('Authorization', `Bearer ${token}`);
          }
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
          checkAllComplete();
        },
        onError: (error) => {
          setFileStates((prev) =>
            prev.map((f, i) =>
              i === idx ? { ...f, status: 'error', error: error.message } : f,
            ),
          );
        },
      });

      setFileStates((prev) =>
        prev.map((f, i) => (i === idx ? { ...f, status: 'uploading', tusUpload: upload } : f)),
      );

      upload.start();
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
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
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
        <div className="mb-2 text-2xl text-primary/60">+</div>
        <p className="text-sm text-gray-600">
          Drag & Drop or{' '}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer font-medium text-primary hover:underline"
          >
            Browse
          </button>
        </p>
        <p className="mt-1 text-xs text-gray-400">
          .fastq.gz, .fastq, .fq.gz, .fq
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".fastq,.fastq.gz,.fq,.fq.gz"
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      {fileStates.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {fileStates.length} file{fileStates.length !== 1 ? 's' : ''}{' '}
            {stagedFiles.length > 0 && `(${formatBytes(totalStagedSize)})`}
          </div>
          <div className="max-h-48 overflow-y-auto rounded border border-gray-200">
            {fileStates.map((fs, i) => (
              <div
                key={`${fs.file.name}-${i}`}
                className="flex items-center justify-between border-b border-gray-100 px-3 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm text-gray-700">{fs.file.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{formatBytes(fs.file.size)}</span>
                  {fs.status === 'complete' && (
                    <span className="ml-2 text-xs text-green-600">Done</span>
                  )}
                  {fs.status === 'error' && (
                    <span className="ml-2 text-xs text-red-600">{fs.error || 'Failed'}</span>
                  )}
                  {fs.status === 'uploading' && (
                    <span className="ml-2 text-xs text-primary">{fs.progress}%</span>
                  )}
                </div>
                {fs.status === 'uploading' && (
                  <div className="mx-2 h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
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
                    className="ml-2 text-gray-400 hover:text-red-500"
                  >
                    ✕
                  </button>
                )}
                {fs.status === 'uploading' && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-2 text-xs text-gray-400 hover:text-red-500"
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
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${overallProgress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">{overallProgress}% overall</p>
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
