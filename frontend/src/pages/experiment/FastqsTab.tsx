// frontend/src/pages/experiment/FastqsTab.tsx
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, FileText, HardDrive, Server, Trash2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from 'sonner';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { FileUploadZone } from '@/components/fastqs/FileUploadZone';
import { FastqcReportModal } from '@/components/fastqs/FastqcReportModal';
import { ServerImportModal } from '@/components/fastqs/ServerImportModal';
import { LocalImportModal } from '@/components/fastqs/LocalImportModal';
import { TrimConfigModal } from '@/components/fastqs/TrimConfigModal';
import type { TrimParams } from '@/components/fastqs/TrimConfigModal';
import { useFastqs, useDeleteFastq } from '@/hooks/useFastqs';
import { useCreateJob, useJob } from '@/hooks/useJobs';
import { formatBytes, formatDate } from '@/lib/utils';
import type { Experiment, FastqFile } from '@/api/types';

interface ExperimentContext {
  experiment: Experiment;
  isReadOnly?: boolean;
}

const staticColumns: ColumnDef<FastqFile, unknown>[] = [
  {
    accessorKey: 'filename',
    header: 'Name',
    cell: (info) => {
      const row = info.row.original;
      return (
        <span className="flex items-center gap-2">
          {row.filename}
          {row.isTrimmed && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
              trimmed
            </span>
          )}
        </span>
      );
    },
  },
  {
    accessorKey: 'fileSizeBytes',
    header: 'Size',
    cell: (info) => {
      const v = info.getValue<number | null>();
      return v != null ? <span className="font-mono">{formatBytes(v)}</span> : '\u2014';
    },
  },
  {
    accessorKey: 'uploadedAt',
    header: 'Uploaded',
    cell: (info) => formatDate(info.getValue<string>()),
  },
];

function buildTrimJobParams(
  experiment: Experiment,
  rawFastqs: FastqFile[],
  trimParams?: TrimParams,
) {
  // Group raw FASTQs by prefix to form R1/R2 pairs
  const pairMap = new Map<string, { r1?: FastqFile; r2?: FastqFile }>();
  for (const f of rawFastqs) {
    if (f.isTrimmed) continue;
    const entry = pairMap.get(f.prefix) ?? {};
    if (f.readDirection === 'R1') entry.r1 = f;
    else if (f.readDirection === 'R2') entry.r2 = f;
    pairMap.set(f.prefix, entry);
  }

  const fastqPairs = Array.from(pairMap.entries())
    .filter(([, pair]) => pair.r1 && pair.r2)
    .map(([prefix, pair]) => ({
      prefix,
      r1_path: pair.r1!.filePath,
      r2_path: pair.r2!.filePath,
      r1_id: pair.r1!.id,
      r2_id: pair.r2!.id,
    }));

  return {
    experiment_id: experiment.id,
    project_id: experiment.projectId,
    fastq_pairs: fastqPairs,
    ...(trimParams && {
      adapter_file: trimParams.adapterFile,
      illuminaclip: trimParams.illuminaclip,
      leading: trimParams.leading,
      trailing: trimParams.trailing,
      slidingwindow: trimParams.slidingwindow,
      minlen: trimParams.minlen,
      kseq_length: trimParams.kseqLength,
    }),
  };
}

export default function FastqsTab() {
  const { experiment, isReadOnly } = useOutletContext<ExperimentContext>();
  const { data, isLoading } = useFastqs(experiment.id);
  const deleteMutation = useDeleteFastq();
  const createJobMutation = useCreateJob();
  const [showUpload, setShowUpload] = useState(false);
  const [showServerImport, setShowServerImport] = useState(false);
  const [showLocalImport, setShowLocalImport] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FastqFile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [fastqcTarget, setFastqcTarget] = useState<FastqFile | null>(null);
  const [showTrimConfig, setShowTrimConfig] = useState(false);
  const [adapterDismissed, setAdapterDismissed] = useState(false);
  const [trimmingJobId, setTrimmingJobId] = useState<number | null>(null);

  const { data: trimmingJob } = useJob(trimmingJobId);

  const fastqs = useMemo(() => data?.items ?? [], [data?.items]);

  // Derive adapter detection state
  const adapterState = useMemo(() => {
    const rawFastqs = fastqs.filter((f) => !f.isTrimmed);
    const filesWithAdapters = rawFastqs.filter(
      (f) => f.adapterStatus === 'warn' || f.adapterStatus === 'fail',
    );
    const hasTrimmedFiles = fastqs.some((f) => f.isTrimmed);
    const fastqcPending = rawFastqs.some((f) => f.adapterStatus === null && f.totalReads === null);
    return { rawFastqs, filesWithAdapters, hasTrimmedFiles, fastqcPending };
  }, [fastqs]);

  const showAdapterBanner =
    adapterState.filesWithAdapters.length > 0 &&
    !adapterState.hasTrimmedFiles &&
    !adapterDismissed &&
    trimmingJobId === null;

  const isTrimmingInProgress =
    trimmingJobId !== null &&
    trimmingJob?.status !== 'complete' &&
    trimmingJob?.status !== 'error';

  // When trimming job completes, clear the job tracker
  if (trimmingJob?.status === 'complete' || trimmingJob?.status === 'error') {
    // Defer state update to avoid setting state during render
    if (trimmingJobId !== null) {
      setTimeout(() => setTrimmingJobId(null), 0);
    }
  }

  function handleQuickTrim() {
    const params = buildTrimJobParams(experiment, adapterState.rawFastqs);
    createJobMutation.mutate(
      {
        experimentId: experiment.id,
        payload: {
          jobType: 'trimming',
          name: 'Auto Trim',
          params,
        },
      },
      {
        onSuccess: (job) => {
          setTrimmingJobId(job.id);
          toast.success('Trimming job queued');
        },
        onError: () => toast.error('Failed to start trimming'),
      },
    );
  }

  function handleConfiguredTrim(trimParams: TrimParams) {
    const params = buildTrimJobParams(experiment, adapterState.rawFastqs, trimParams);
    createJobMutation.mutate(
      {
        experimentId: experiment.id,
        payload: {
          jobType: 'trimming',
          name: 'Configured Trim',
          params,
        },
      },
      {
        onSuccess: (job) => {
          setTrimmingJobId(job.id);
          setShowTrimConfig(false);
          toast.success('Trimming job queued');
        },
        onError: () => toast.error('Failed to start trimming'),
      },
    );
  }

  const columnsWithActions: ColumnDef<FastqFile, unknown>[] = [
    ...staticColumns,
    {
      id: 'fastqc',
      header: 'FASTQC',
      cell: (info) => {
        const row = info.row.original;
        if (!row.fastqcReportPath) {
          return row.totalReads == null ? (
            <span className="text-muted-foreground animate-pulse" title="FastQC running...">
              ...
            </span>
          ) : (
            <span className="text-muted-foreground/50">{'\u2014'}</span>
          );
        }
        return (
          <button
            type="button"
            onClick={() => setFastqcTarget(row)}
            className="text-primary hover:text-primary/80"
            title="View FastQC Report"
          >
            <FileText className="h-5 w-5" />
          </button>
        );
      },
    },
    {
      accessorKey: 'totalReads',
      header: 'Total Reads',
      cell: (info) => {
        const v = info.getValue<number | null>();
        return v != null ? <span className="font-mono">{v.toLocaleString()}</span> : '\u2014';
      },
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => (
        <button
          type="button"
          onClick={() => {
            setDeleteError(null);
            setDeleteTarget(info.row.original);
          }}
          className="text-muted-foreground hover:text-red-500"
          title="Delete"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    deleteMutation.mutate(
      { experimentId: experiment.id, fastqId: deleteTarget.id },
      {
        onSuccess: () => {
          setDeleteTarget(null);
          toast.success('File deleted');
        },
        onError: () => setDeleteError('Failed to delete file. Please try again.'),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            FASTQ Files
          </h3>
          {!isReadOnly && (
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => setShowUpload((prev) => !prev)}
              >
                {showUpload ? 'Close' : '+ Add FASTQs'}
              </Button>
              <Button
                variant="outlined"
                onClick={() => setShowServerImport(true)}
              >
                <Server className="mr-1 h-4 w-4" />
                Import from Server
              </Button>
              <Button
                variant="outlined"
                onClick={() => setShowLocalImport(true)}
              >
                <HardDrive className="mr-1 h-4 w-4" />
                Import from Instance
              </Button>
            </div>
          )}
        </div>

        {showUpload && (
          <FileUploadZone
            experimentId={experiment.id}
            onUploadComplete={() => setShowUpload(false)}
          />
        )}

        {/* Adapter detection banner */}
        {showAdapterBanner && (
          <div className="mb-4 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span>
                  Adapters detected in{' '}
                  <strong>{adapterState.filesWithAdapters.length}</strong> of{' '}
                  {adapterState.rawFastqs.length} files — trimming recommended
                </span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  className="!px-4 !py-1 text-xs"
                  onClick={handleQuickTrim}
                  disabled={createJobMutation.isPending}
                >
                  {createJobMutation.isPending ? 'Starting...' : 'Trim'}
                </Button>
                <Button
                  variant="outlined"
                  className="!px-4 !py-1 text-xs"
                  onClick={() => setShowTrimConfig(true)}
                >
                  Configure
                </Button>
                <Button
                  variant="secondary"
                  className="!px-4 !py-1 text-xs"
                  onClick={() => setAdapterDismissed(true)}
                >
                  Skip
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Trimming in progress banner */}
        {isTrimmingInProgress && (
          <div className="mb-4 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
            <div className="flex items-center gap-2">
              <Spinner size="sm" className="text-blue-500" />
              <span>
                Trimming in progress...{' '}
                {trimmingJob?.status === 'queued' ? '(queued)' : '(running)'}
              </span>
            </div>
          </div>
        )}

        {/* Trimming error banner */}
        {trimmingJob?.status === 'error' && (
          <div className="mb-4 rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            Trimming failed: {trimmingJob.errorMessage ?? 'Unknown error'}
          </div>
        )}

        {fastqs.length > 0 ? (
          <DataTable data={fastqs} columns={columnsWithActions} />
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No FASTQ files uploaded yet. Click + Add FASTQs to get started.
          </p>
        )}
      </Card>

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete FASTQ File"
      >
        <p className="mb-4 text-sm text-foreground">
          Are you sure you want to delete{' '}
          <span className="font-medium">{deleteTarget?.filename}</span>? This
          action cannot be undone.
        </p>
        {deleteError && (
          <p className="mb-3 text-sm text-red-600">{deleteError}</p>
        )}
        <div className="flex justify-end gap-3">
          <Button variant="outlined" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </Modal>

      <FastqcReportModal
        isOpen={fastqcTarget !== null}
        onClose={() => setFastqcTarget(null)}
        experimentId={experiment.id}
        fastqId={fastqcTarget?.id ?? null}
        filename={fastqcTarget?.filename ?? ''}
      />

      <TrimConfigModal
        isOpen={showTrimConfig}
        onClose={() => setShowTrimConfig(false)}
        onSubmit={handleConfiguredTrim}
        isSubmitting={createJobMutation.isPending}
      />

      <ServerImportModal
        experimentId={experiment.id}
        isOpen={showServerImport}
        onClose={() => setShowServerImport(false)}
      />

      <LocalImportModal
        experimentId={experiment.id}
        isOpen={showLocalImport}
        onClose={() => setShowLocalImport(false)}
      />
    </>
  );
}
