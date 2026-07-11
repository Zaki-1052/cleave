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
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { FileUploadZone } from '@/components/fastqs/FileUploadZone';
import { FastqcReportModal } from '@/components/fastqs/FastqcReportModal';
import { ServerImportModal } from '@/components/fastqs/ServerImportModal';
import { LocalImportModal } from '@/components/fastqs/LocalImportModal';
import { TrimConfigModal } from '@/components/fastqs/TrimConfigModal';
import type { TrimParams } from '@/components/fastqs/TrimConfigModal';
import { FastpConfigModal } from '@/components/fastqs/FastpConfigModal';
import type { FastpParams } from '@/components/fastqs/FastpConfigModal';
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
            <span className="rounded-full bg-success/10 px-2 py-0.5 font-mono text-[11px] font-medium text-success ring-1 ring-inset ring-success/25">
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
      return v != null ? <span className="font-mono tabular-nums">{formatBytes(v)}</span> : '\u2014';
    },
  },
  {
    accessorKey: 'uploadedAt',
    header: 'Uploaded',
    cell: (info) => (
      <span className="font-mono text-xs text-muted-foreground">{formatDate(info.getValue<string>())}</span>
    ),
  },
];

function buildFastqPairs(rawFastqs: FastqFile[]) {
  const pairMap = new Map<string, { r1?: FastqFile; r2?: FastqFile }>();
  for (const f of rawFastqs) {
    if (f.isTrimmed) continue;
    const entry = pairMap.get(f.prefix) ?? {};
    if (f.readDirection === 'R1') entry.r1 = f;
    else if (f.readDirection === 'R2') entry.r2 = f;
    pairMap.set(f.prefix, entry);
  }
  return Array.from(pairMap.entries())
    .filter(([, pair]) => pair.r1 && pair.r2)
    .map(([prefix, pair]) => ({
      prefix,
      r1_path: pair.r1!.filePath,
      r2_path: pair.r2!.filePath,
      r1_id: pair.r1!.id,
      r2_id: pair.r2!.id,
    }));
}

function detectReadLength(rawFastqs: FastqFile[]): number | undefined {
  const lengths = rawFastqs
    .filter((f) => f.readDirection === 'R1' && f.sequenceLength != null)
    .map((f) => f.sequenceLength as number);
  return lengths.length > 0 ? Math.max(...lengths) : undefined;
}

function buildTrimJobParams(
  experiment: Experiment,
  rawFastqs: FastqFile[],
  trimParams?: TrimParams,
) {
  const fastqPairs = buildFastqPairs(rawFastqs);
  const detectedLength = detectReadLength(rawFastqs);
  return {
    experiment_id: experiment.id,
    project_id: experiment.projectId,
    fastq_pairs: fastqPairs,
    ...(detectedLength && !trimParams && { kseq_length: detectedLength }),
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

function buildFastpJobParams(
  experiment: Experiment,
  rawFastqs: FastqFile[],
  fastpParams?: FastpParams,
) {
  const fastqPairs = buildFastqPairs(rawFastqs);
  return {
    experiment_id: experiment.id,
    project_id: experiment.projectId,
    fastq_pairs: fastqPairs,
    ...(fastpParams && {
      qualified_quality_phred: fastpParams.qualifiedQualityPhred,
      length_required: fastpParams.lengthRequired,
      cut_front: fastpParams.cutFront,
      cut_tail: fastpParams.cutTail,
      cut_window_size: fastpParams.cutWindowSize,
      cut_mean_quality: fastpParams.cutMeanQuality,
      detect_adapter_for_pe: fastpParams.detectAdapterForPe,
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

  const detectedReadLength = useMemo(
    () => detectReadLength(adapterState.rawFastqs),
    [adapterState.rawFastqs],
  );

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

  const isRnaseq = experiment.assayType === 'RNA-seq';
  const trimJobType = isRnaseq ? 'rnaseq_trimming' : 'trimming';

  function handleQuickTrim() {
    const params = isRnaseq
      ? buildFastpJobParams(experiment, adapterState.rawFastqs)
      : buildTrimJobParams(experiment, adapterState.rawFastqs);
    createJobMutation.mutate(
      {
        experimentId: experiment.id,
        payload: {
          jobType: trimJobType,
          name: isRnaseq ? 'fastp Trim' : 'Auto Trim',
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

  function handleConfiguredFastp(fastpParams: FastpParams) {
    const params = buildFastpJobParams(experiment, adapterState.rawFastqs, fastpParams);
    createJobMutation.mutate(
      {
        experimentId: experiment.id,
        payload: {
          jobType: 'rnaseq_trimming',
          name: 'Configured fastp Trim',
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
            <Skeleton className="inline-block h-4 w-10" title="FastQC running\u2026" />
          ) : (
            <span className="text-muted-foreground/50">{'\u2014'}</span>
          );
        }
        return (
          <button
            type="button"
            onClick={() => setFastqcTarget(row)}
            aria-label="View FastQC report"
            title="View FastQC report"
            className="rounded-md p-1.5 text-primary transition-colors duration-150 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        return v != null ? <span className="font-mono tabular-nums">{v.toLocaleString()}</span> : '\u2014';
      },
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => (
        <button
          type="button"
          onClick={() => setDeleteTarget(info.row.original)}
          aria-label="Delete file"
          title="Delete"
          className="rounded-md p-2 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ),
    },
  ];

  function handleDelete() {
    if (!deleteTarget) return;
    deleteMutation.mutate(
      { experimentId: experiment.id, fastqId: deleteTarget.id },
      {
        onSuccess: () => {
          setDeleteTarget(null);
          toast.success('File deleted');
        },
        onError: () => toast.error('Failed to delete file. Please try again.'),
      },
    );
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
                variant="outline"
                onClick={() => setShowServerImport(true)}
              >
                <Server className="mr-1 h-4 w-4" />
                Import from Server
              </Button>
              <Button
                variant="outline"
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
          <div className="mb-4 rounded-md border border-warning/25 bg-warning/10 px-4 py-3 text-sm text-foreground/80">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
                <span>
                  Adapters detected in{' '}
                  <strong className="font-mono tabular-nums">{adapterState.filesWithAdapters.length}</strong> of{' '}
                  <span className="font-mono tabular-nums">{adapterState.rawFastqs.length}</span> files — trimming recommended
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
                  variant="outline"
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
          <div className="mb-4 rounded-md border border-info/25 bg-info/10 px-4 py-3 text-sm text-foreground/80">
            <div className="flex items-center gap-2">
              <Spinner size="sm" className="text-info" />
              <span>
                Trimming in progress...{' '}
                {trimmingJob?.status === 'queued' ? '(queued)' : '(running)'}
              </span>
            </div>
          </div>
        )}

        {/* Trimming error banner */}
        {trimmingJob?.status === 'error' && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground/80">
            Trimming failed: {trimmingJob.errorMessage ?? 'Unknown error'}
          </div>
        )}

        {isLoading ? (
          <DataTable data={[]} columns={columnsWithActions} isLoading />
        ) : fastqs.length > 0 ? (
          <DataTable data={fastqs} columns={columnsWithActions} />
        ) : (
          <EmptyState
            icon={FileText}
            title="No FASTQ files yet"
            description="Click + Add FASTQs to get started."
          />
        )}
      </Card>

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete FASTQ file"
        description={
          deleteTarget
            ? `Delete ${deleteTarget.filename}? This action cannot be undone.`
            : undefined
        }
        confirmLabel={deleteMutation.isPending ? 'Deleting…' : 'Delete'}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />

      <FastqcReportModal
        isOpen={fastqcTarget !== null}
        onClose={() => setFastqcTarget(null)}
        experimentId={experiment.id}
        fastqId={fastqcTarget?.id ?? null}
        filename={fastqcTarget?.filename ?? ''}
      />

      {isRnaseq ? (
        <FastpConfigModal
          isOpen={showTrimConfig}
          onClose={() => setShowTrimConfig(false)}
          onSubmit={handleConfiguredFastp}
          isSubmitting={createJobMutation.isPending}
        />
      ) : (
        <TrimConfigModal
          isOpen={showTrimConfig}
          onClose={() => setShowTrimConfig(false)}
          onSubmit={handleConfiguredTrim}
          isSubmitting={createJobMutation.isPending}
          defaultKseqLength={detectedReadLength}
        />
      )}

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
