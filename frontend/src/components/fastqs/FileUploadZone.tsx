// frontend/src/components/fastqs/FileUploadZone.tsx
import { useRef, useState, type DragEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { useUploadFastqs } from '@/hooks/useFastqs';
import { formatBytes } from '@/lib/utils';
import type { ApiError } from '@/api/types';

const VALID_EXTENSIONS = ['.fastq.gz', '.fastq', '.fq.gz', '.fq'];

function hasValidExtension(name: string): boolean {
  return VALID_EXTENSIONS.some((ext) => name.toLowerCase().endsWith(ext));
}

interface FileUploadZoneProps {
  experimentId: number;
  onUploadComplete: () => void;
}

export function FileUploadZone({ experimentId, onUploadComplete }: FileUploadZoneProps) {
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadFastqs();

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
      setStagedFiles((prev) => [...prev, ...valid]);
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
    // Reset so the same file can be re-selected
    e.target.value = '';
  }

  function removeFile(index: number) {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (stagedFiles.length === 0 || isUploading) return;

    setIsUploading(true);
    setUploadPercent(0);
    setUploadError(null);

    try {
      await uploadMutation.mutateAsync({
        experimentId,
        files: stagedFiles,
        onProgress: setUploadPercent,
      });
      setStagedFiles([]);
      setUploadPercent(0);
      onUploadComplete();
    } catch (err) {
      const apiErr = err as ApiError;
      setUploadError(apiErr.detail ?? apiErr.error ?? 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  const totalStagedSize = stagedFiles.reduce((sum, f) => sum + f.size, 0);

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

      {stagedFiles.length > 0 && (
        <div className="mt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            {stagedFiles.length} file{stagedFiles.length !== 1 ? 's' : ''} selected ({formatBytes(totalStagedSize)})
          </div>
          <div className="max-h-48 overflow-y-auto rounded border border-gray-200">
            {stagedFiles.map((file, i) => (
              <div
                key={`${file.name}-${i}`}
                className="flex items-center justify-between border-b border-gray-100 px-3 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <span className="truncate text-sm text-gray-700">{file.name}</span>
                  <span className="ml-2 text-xs text-gray-400">{formatBytes(file.size)}</span>
                </div>
                {!isUploading && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="ml-2 text-gray-400 hover:text-red-500"
                  >
                    ✕
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
                  style={{ width: `${uploadPercent}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">{uploadPercent}% uploaded</p>
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
