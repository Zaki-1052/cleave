// frontend/src/components/fastqs/ServerImportModal.tsx
import { useCallback, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Download,
  Folder,
  FileText,
  Loader2,
  Server,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';
import { cn } from '@/lib/cn';
import { formatBytes } from '@/lib/utils';
import {
  useServerBrowse,
  useServerImportStart,
  useImportProgress,
  useSavedServers,
  useDeleteSavedServer,
} from '@/hooks/useServerImport';
import type {
  RemoteFileEntry,
  ServerConnectRequest,
} from '@/api/serverImport';

interface Props {
  experimentId: number;
  isOpen: boolean;
  onClose: () => void;
}

const FASTQ_EXTENSIONS = ['.fastq.gz', '.fastq', '.fq.gz', '.fq'];

function isFastqFile(name: string): boolean {
  const lower = name.toLowerCase();
  return FASTQ_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function ServerImportModal({ experimentId, isOpen, onClose }: Props) {
  const [step, setStep] = useState(0);

  // Step 1: Connection form state
  const [protocol, setProtocol] = useState<'ftp' | 'sftp'>('ftp');
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [saveServer, setSaveServer] = useState(false);
  const [serverName, setServerName] = useState('');
  const [connectError, setConnectError] = useState<string | null>(null);
  const [usingSavedServerId, setUsingSavedServerId] = useState<number | null>(null);

  // Step 2: Browse state
  const [currentPath, setCurrentPath] = useState('/');
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Step 3: Import state
  const [importId, setImportId] = useState<string | null>(null);

  const browseMutation = useServerBrowse();
  const importMutation = useServerImportStart();
  const { data: savedServers } = useSavedServers();
  const deleteSavedServer = useDeleteSavedServer();
  const { data: importProgress } = useImportProgress(experimentId, importId);

  const defaultPort = protocol === 'sftp' ? '22' : '21';

  const buildConnectRequest = useCallback(
    (path: string): ServerConnectRequest => ({
      protocol,
      host,
      port: port ? parseInt(port, 10) : undefined,
      username,
      password,
      path,
      savedServerId: usingSavedServerId ?? undefined,
    }),
    [protocol, host, port, username, password, usingSavedServerId],
  );

  function handleConnect() {
    setConnectError(null);
    const path = currentPath || '/';
    browseMutation.mutate(
      { experimentId, req: buildConnectRequest(path) },
      {
        onSuccess: (data) => {
          setCurrentPath(data.currentPath);
          setEntries(data.entries);
          setSelectedPaths(new Set());
          setStep(1);
        },
        onError: (err) => {
          const message =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            'Connection failed';
          setConnectError(message);
        },
      },
    );
  }

  function handleNavigate(path: string) {
    browseMutation.mutate(
      { experimentId, req: buildConnectRequest(path) },
      {
        onSuccess: (data) => {
          setCurrentPath(data.currentPath);
          setEntries(data.entries);
        },
        onError: () => toast.error('Failed to browse directory'),
      },
    );
  }

  function handleSelectAll() {
    const fastqPaths = entries.filter((e) => !e.isDir && isFastqFile(e.name)).map((e) => e.path);
    setSelectedPaths(new Set(fastqPaths));
  }

  function toggleSelection(path: string) {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleStartImport() {
    importMutation.mutate(
      {
        experimentId,
        req: {
          protocol,
          host,
          port: port ? parseInt(port, 10) : undefined,
          username,
          password,
          filePaths: Array.from(selectedPaths),
          saveServer,
          serverName: saveServer ? serverName : undefined,
        },
      },
      {
        onSuccess: (data) => {
          setImportId(data.importId);
          setStep(2);
        },
        onError: (err) => {
          const message =
            (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            'Failed to start import';
          toast.error(message);
        },
      },
    );
  }

  function handleUseSavedServer(server: {
    id: number;
    protocol: 'ftp' | 'sftp';
    host: string;
    port: number | null;
    username: string;
    defaultPath: string;
  }) {
    setProtocol(server.protocol);
    setHost(server.host);
    setPort(server.port?.toString() || '');
    setUsername(server.username);
    setUsingSavedServerId(server.id);
    setCurrentPath(server.defaultPath);
    setPassword('');
  }

  function handleClose() {
    // Reset all state
    setStep(0);
    setProtocol('ftp');
    setHost('');
    setPort('');
    setUsername('');
    setPassword('');
    setSaveServer(false);
    setServerName('');
    setConnectError(null);
    setUsingSavedServerId(null);
    setCurrentPath('/');
    setEntries([]);
    setSelectedPaths(new Set());
    setImportId(null);
    onClose();
  }

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

  const connectStep = (
    <div className="space-y-6">
      {/* Saved servers */}
      {savedServers && savedServers.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-medium text-muted-foreground">Saved Servers</h4>
          <div className="grid grid-cols-2 gap-3">
            {savedServers.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleUseSavedServer(s)}
                className={cn(
                  'group relative flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50',
                  usingSavedServerId === s.id && 'border-primary bg-primary/5',
                )}
              >
                <Server className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {s.protocol.toUpperCase()} &middot; {s.host}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSavedServer.mutate(s.id);
                  }}
                  className="absolute right-2 top-2 hidden text-muted-foreground hover:text-red-500 group-hover:block"
                  title="Delete saved server"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </button>
            ))}
          </div>
          <hr className="my-4" />
        </div>
      )}

      {/* Connection form */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Protocol</label>
          <div className="flex rounded-md border">
            {(['ftp', 'sftp'] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  setProtocol(p);
                  setPort('');
                }}
                className={cn(
                  'flex-1 px-4 py-2 text-sm font-medium transition-colors',
                  protocol === p
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Port</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            placeholder={defaultPort}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Host</label>
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="ftp.example.com"
          className="w-full rounded-md border px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Save server checkbox */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={saveServer}
            onChange={(e) => setSaveServer(e.target.checked)}
            className="rounded border-gray-300"
          />
          Save this server for future imports
        </label>
        {saveServer && (
          <input
            type="text"
            value={serverName}
            onChange={(e) => setServerName(e.target.value)}
            placeholder="Server name (e.g., IGM FTP)"
            className="w-full rounded-md border px-3 py-2 text-sm"
          />
        )}
      </div>

      {connectError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
          {connectError}
        </div>
      )}
    </div>
  );

  const browseStep = (
    <div className="flex h-full flex-col">
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
        {browseMutation.isPending && <Loader2 className="ml-2 h-3.5 w-3.5 animate-spin" />}
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
                <td colSpan={3} className="px-3 py-8 text-center text-muted-foreground">
                  Directory is empty
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Selection summary */}
      <div className="mt-3 flex items-center justify-between text-sm">
        <Button variant="outlined" size="sm" onClick={handleSelectAll}>
          Select All FASTQs
        </Button>
        <span className="text-muted-foreground">
          {selectedPaths.size} file{selectedPaths.size !== 1 ? 's' : ''} selected
          {selectedSize > 0 && ` (${formatBytes(selectedSize)})`}
        </span>
      </div>
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
                {importProgress.status === 'connecting' && 'Connecting...'}
                {importProgress.status === 'downloading' &&
                  `Downloading ${importProgress.completedCount} / ${importProgress.totalCount}`}
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
                  importProgress.status === 'error' ? 'bg-red-500' : 'bg-primary',
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
                {f.status === 'error' && <XCircle className="h-4 w-4 text-red-500" />}

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
    { label: 'Connect', content: connectStep },
    { label: 'Browse & Select', content: browseStep },
    { label: 'Import', content: progressStep },
  ];

  const canConnect = host.trim() && username.trim() && password.trim();

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Import from Server"
      steps={steps}
      currentStep={step}
      onNext={() => {
        if (step === 0) handleConnect();
        else if (step === 1) setStep(2);
      }}
      onBack={() => {
        if (step === 1) setStep(0);
      }}
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
                onClick={handleConnect}
                disabled={!canConnect || browseMutation.isPending}
              >
                {browseMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Connecting...
                  </span>
                ) : (
                  'Connect'
                )}
              </Button>
            )}
            {step === 1 && (
              <>
                <Button variant="outlined" onClick={() => setStep(0)}>
                  Back
                </Button>
                <Button
                  onClick={handleStartImport}
                  disabled={selectedPaths.size === 0 || importMutation.isPending}
                >
                  <Download className="mr-1 h-4 w-4" />
                  Import {selectedPaths.size} File{selectedPaths.size !== 1 ? 's' : ''}
                </Button>
              </>
            )}
            {step === 2 && isImportDone && (
              <Button onClick={handleClose}>Done</Button>
            )}
          </div>
        </div>
      )}
    />
  );
}
