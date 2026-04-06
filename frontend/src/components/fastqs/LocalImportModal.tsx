// frontend/src/components/fastqs/LocalImportModal.tsx
import { useCallback, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Download,
  Folder,
  FileText,
  HardDrive,
  Loader2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/utils';
import {
  useLocalBrowse,
  useLocalImportStart,
  useLocalImportProgress,
} from '@/hooks/useLocalImport';
import type { RemoteFileEntry } from '@/api/localImport';

interface Props {
  experimentId: number;
  isOpen: boolean;
  onClose: () => void;
}

const FASTQ_EXTENSIONS = ['.fastq.gz', '.fastq', '.fq.gz', '.fq'];
const DEFAULT_PATH = '/data';

function isFastqFile(name: string): boolean {
  const lower = name.toLowerCase();
  return FASTQ_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function LocalImportModal({ experimentId, isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  // Browse state
  const [pathInput, setPathInput] = useState(DEFAULT_PATH);
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [browseError, setBrowseError] = useState('');
  const [hasBrowsed, setHasBrowsed] = useState(false);

  // Import options
  const [useSymlink, setUseSymlink] = useState(false);

  // Import state
  const [importId, setImportId] = useState<string | null>(null);

  // Hooks
  const browseMutation = useLocalBrowse();
  const importMutation = useLocalImportStart();
  const { data: importProgress } = useLocalImportProgress(experimentId, importId);

  const handleBrowse = useCallback(
    (path: string) => {
      setBrowseError('');
      browseMutation.mutate(
        { experimentId, req: { path } },
        {
          onSuccess: (data) => {
            setCurrentPath(data.currentPath);
            setEntries(data.entries);
            setHasBrowsed(true);
          },
          onError: (err: unknown) => {
            const msg =
              err instanceof Error ? err.message : 'Failed to browse directory';
            // Extract detail from Axios error
            const axiosErr = err as { response?: { data?: { detail?: string } } };
            setBrowseError(axiosErr.response?.data?.detail || msg);
          },
        },
      );
    },
    [browseMutation, experimentId],
  );

  const handleNavigate = useCallback(
    (path: string) => {
      setPathInput(path);
      handleBrowse(path);
    },
    [handleBrowse],
  );

  const toggleSelection = useCallback((path: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    const fastqs = entries.filter((e) => !e.isDir && isFastqFile(e.name));
    const allSelected = fastqs.every((e) => selectedPaths.has(e.path));
    if (allSelected) {
      setSelectedPaths(new Set());
    } else {
      setSelectedPaths(new Set(fastqs.map((e) => e.path)));
    }
  }, [entries, selectedPaths]);

  const handleStartImport = useCallback(() => {
    const filePaths = Array.from(selectedPaths);
    importMutation.mutate(
      {
        experimentId,
        req: { filePaths, useSymlink },
      },
      {
        onSuccess: (data) => {
          setImportId(data.importId);
          setStep(1);
          toast.success(`Importing ${data.fileCount} file(s)`);
        },
        onError: (err: unknown) => {
          const axiosErr = err as { response?: { data?: { detail?: string } } };
          toast.error(axiosErr.response?.data?.detail || 'Failed to start import');
        },
      },
    );
  }, [experimentId, importMutation, selectedPaths, useSymlink]);

  const handleClose = useCallback(() => {
    // Reset state
    setStep(0);
    setPathInput(DEFAULT_PATH);
    setCurrentPath('');
    setEntries([]);
    setSelectedPaths(new Set());
    setBrowseError('');
    setHasBrowsed(false);
    setUseSymlink(false);
    setImportId(null);

    // Invalidate FASTQ list to show newly imported files
    void queryClient.invalidateQueries({ queryKey: ['fastqs', experimentId] });
    onClose();
  }, [experimentId, onClose, queryClient]);

  // Breadcrumb segments
  const pathSegments = useMemo(() => {
    const parts = currentPath.split('/').filter(Boolean);
    return [
      { label: '/', path: '/' },
      ...parts.map((part, i) => ({
        label: part,
        path: '/' + parts.slice(0, i + 1).join('/'),
      })),
    ];
  }, [currentPath]);

  const selectedSize = useMemo(() => {
    return entries
      .filter((e) => selectedPaths.has(e.path))
      .reduce((acc, e) => acc + (e.size || 0), 0);
  }, [entries, selectedPaths]);

  const isImportDone =
    importProgress?.status === 'complete' || importProgress?.status === 'error';

  // ------ Step content ------

  const browseStep = (
    <div className="flex h-full flex-col">
      {/* Path input */}
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <HardDrive className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={pathInput}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleBrowse(pathInput);
            }}
            placeholder="/data/rs_256/fastq"
            className="w-full rounded-md border py-2 pl-10 pr-3 text-sm"
          />
        </div>
        <Button
          onClick={() => handleBrowse(pathInput)}
          disabled={!pathInput.trim() || browseMutation.isPending}
        >
          {browseMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            'Browse'
          )}
        </Button>
      </div>

      {browseError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {browseError}
        </div>
      )}

      {hasBrowsed && (
        <>
          {/* Breadcrumb */}
          <div className="mb-3 flex items-center gap-1 text-sm text-muted-foreground">
            {pathSegments.map((seg, i) => (
              <span key={seg.path} className="flex items-center gap-1">
                {i > 0 && <ChevronRight className="h-3 w-3" />}
                <button
                  type="button"
                  onClick={() => handleNavigate(seg.path)}
                  className="hover:text-foreground hover:underline"
                >
                  {seg.label}
                </button>
              </span>
            ))}
            {browseMutation.isPending && (
              <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin" />
            )}
          </div>

          {/* File list */}
          <div className="flex-1 overflow-y-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th className="w-8 px-3 py-2" />
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">Size</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const isFastq = !entry.isDir && isFastqFile(entry.name);
                  const isSelected = selectedPaths.has(entry.path);
                  return (
                    <tr
                      key={entry.path}
                      className={cn(
                        'border-b transition-colors',
                        entry.isDir && 'cursor-pointer hover:bg-muted/50',
                        isFastq && 'cursor-pointer hover:bg-muted/50',
                        !entry.isDir && !isFastq && 'opacity-40',
                      )}
                      onClick={() => {
                        if (entry.isDir) handleNavigate(entry.path);
                        else if (isFastq) toggleSelection(entry.path);
                      }}
                    >
                      <td className="px-3 py-2">
                        {isFastq && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(entry.path)}
                            onClick={(e) => e.stopPropagation()}
                            className="rounded border-gray-300"
                          />
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          {entry.isDir ? (
                            <Folder className="h-4 w-4 text-amber-500" />
                          ) : (
                            <FileText className="h-4 w-4 text-muted-foreground" />
                          )}
                          {entry.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {entry.size != null ? formatBytes(entry.size) : ''}
                      </td>
                    </tr>
                  );
                })}
                {entries.length === 0 && (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      Directory is empty
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Symlink toggle */}
          <div className="mt-3 space-y-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useSymlink}
                onChange={(e) => setUseSymlink(e.target.checked)}
                className="rounded border-gray-300"
              />
              Create symlinks instead of copying files
            </label>
            {useSymlink && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Symlinked files reference the original location. If source files
                  are moved or deleted, these links will break and downstream
                  analyses may fail.
                </span>
              </div>
            )}
          </div>

          {/* Selection summary */}
          <div className="mt-3 flex items-center justify-between text-sm">
            <Button variant="outlined" size="sm" onClick={handleSelectAll}>
              Select All FASTQs
            </Button>
            <span className="text-muted-foreground">
              {selectedPaths.size} file{selectedPaths.size !== 1 ? 's' : ''}{' '}
              selected
              {selectedSize > 0 && ` (${formatBytes(selectedSize)})`}
            </span>
          </div>
        </>
      )}
    </div>
  );

  const progressStep = (
    <div className="space-y-4">
      {!importProgress ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* Overall progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">
                {importProgress.status === 'connecting' && 'Preparing...'}
                {importProgress.status === 'downloading' &&
                  `${useSymlink ? 'Linking' : 'Copying'} ${importProgress.completedCount} / ${importProgress.totalCount}`}
                {importProgress.status === 'complete' && 'Import complete'}
                {importProgress.status === 'error' && 'Import failed'}
              </span>
              <span className="text-muted-foreground">
                {importProgress.completedCount}/{importProgress.totalCount}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  importProgress.status === 'error'
                    ? 'bg-red-500'
                    : 'bg-primary',
                )}
                style={{
                  width: `${importProgress.totalCount > 0 ? (importProgress.completedCount / importProgress.totalCount) * 100 : 0}%`,
                }}
              />
            </div>
          </div>

          {importProgress.error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {importProgress.error}
            </div>
          )}

          {/* Per-file progress */}
          <div className="space-y-2">
            {importProgress.files.map((f) => (
              <div
                key={f.remotePath}
                className="flex items-center gap-3 rounded-md border px-3 py-2"
              >
                {f.status === 'pending' && (
                  <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                )}
                {f.status === 'downloading' && (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                )}
                {f.status === 'complete' && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                {f.status === 'error' && (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{f.filename}</div>
                  {f.status === 'downloading' && f.bytesTotal && (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{
                          width: `${(f.bytesDownloaded / f.bytesTotal) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                  {f.error && (
                    <div className="mt-1 text-xs text-red-500">{f.error}</div>
                  )}
                </div>

                <span className="shrink-0 text-xs text-muted-foreground">
                  {f.status === 'downloading' && f.bytesTotal
                    ? `${formatBytes(f.bytesDownloaded)} / ${formatBytes(f.bytesTotal)}`
                    : ''}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const steps = [
    { label: 'Browse & Select', content: browseStep },
    { label: 'Import', content: progressStep },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import from Instance"
      steps={steps}
      currentStep={step}
      onNext={() => {}}
      onBack={() => {}}
      onSubmit={() => {}}
      renderFooter={({ onClose: closeWizard }) => (
        <div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
          <button
            onClick={closeWizard}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {isImportDone ? 'Close' : 'Cancel'}
          </button>
          <div className="flex gap-3">
            {step === 0 && (
              <Button
                onClick={handleStartImport}
                disabled={selectedPaths.size === 0 || importMutation.isPending}
              >
                <Download className="mr-1 h-4 w-4" />
                Import {selectedPaths.size} File
                {selectedPaths.size !== 1 ? 's' : ''}
              </Button>
            )}
            {step === 1 && isImportDone && (
              <Button onClick={handleClose}>Done</Button>
            )}
          </div>
        </div>
      )}
    />
  );
}
