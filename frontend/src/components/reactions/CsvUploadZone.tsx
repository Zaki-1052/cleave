// frontend/src/components/reactions/CsvUploadZone.tsx
import { useRef, useState, type DragEvent } from 'react';
import { Download, Upload } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useImportReactionsCsv } from '@/hooks/useReactions';
import { downloadTemplate } from '@/api/reactions';
import type { ApiError, CsvImportResponse } from '@/api/types';

interface CsvUploadZoneProps {
  experimentId: number;
  onImportComplete: (result: CsvImportResponse) => void;
}

export function CsvUploadZone({ experimentId, onImportComplete }: CsvUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<CsvImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportReactionsCsv();

  async function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setImportError('Invalid file format. Only .csv files are accepted.');
      return;
    }

    setIsImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const result = await importMutation.mutateAsync({ experimentId, file });
      setImportResult(result);
      onImportComplete(result);
    } catch (err) {
      const apiErr = err as { response?: { data?: ApiError }; message?: string };
      const detail = apiErr.response?.data?.detail ?? apiErr.response?.data?.error ?? apiErr.message ?? 'CSV import failed';
      setImportError(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setIsImporting(false);
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
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }

  async function handleDownloadTemplate() {
    try {
      await downloadTemplate(experimentId);
    } catch {
      setImportError('Failed to download template.');
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div>
          <span className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Upload Reaction Sheet
          </span>
          <span className="ml-2 text-xs text-muted-foreground">Supported formats: .csv</span>
        </div>
        <button
          type="button"
          onClick={() => void handleDownloadTemplate()}
          className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
        >
          <Download className="h-4 w-4" />
          Download Template
        </button>
      </div>

      {importError && (
        <div className="mb-3 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          {importError}
        </div>
      )}

      {importResult && (
        <div className="mb-3 space-y-2">
          <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-4 py-3 text-sm text-green-700 dark:text-green-300">
            Successfully imported {importResult.created} reaction{importResult.created !== 1 ? 's' : ''}.
          </div>
          {importResult.warnings.length > 0 && (
            <div className="rounded-md border border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-950 px-4 py-3 text-sm text-yellow-700 dark:text-yellow-300">
              <ul className="list-inside list-disc">
                {importResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragOver ? 'border-primary bg-primary/5' : 'border-primary/40'
        }`}
      >
        {isImporting ? (
          <div className="flex flex-col items-center gap-2">
            <Spinner />
            <p className="text-sm text-muted-foreground">Importing...</p>
          </div>
        ) : (
          <>
            <Upload className="mb-2 h-8 w-8 text-primary/60" />
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
            <p className="mt-1 text-xs text-muted-foreground">.csv files only</p>
          </>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileInput}
          className="hidden"
          aria-label="Select CSV reaction sheet"
        />
      </div>
    </div>
  );
}
