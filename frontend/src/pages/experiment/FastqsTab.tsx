// frontend/src/pages/experiment/FastqsTab.tsx
import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { FileUploadZone } from '@/components/fastqs/FileUploadZone';
import { FastqcReportModal } from '@/components/fastqs/FastqcReportModal';
import { TrimConfigModal } from '@/components/fastqs/TrimConfigModal';
import type { TrimParams } from '@/components/fastqs/TrimConfigModal';
import { useFastqs, useDeleteFastq } from '@/hooks/useFastqs';
import { useCreateJob, useJob } from '@/hooks/useJobs';
import { formatBytes, formatDate } from '@/lib/utils';
import type { Experiment, FastqFile } from '@/api/types';

interface ExperimentContext {
  experiment: Experiment;
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
      return v != null ? formatBytes(v) : '\u2014';
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
  const { experiment } = useOutletContext<ExperimentContext>();
  const { data, isLoading } = useFastqs(experiment.id);
  const deleteMutation = useDeleteFastq();
  const createJobMutation = useCreateJob();
  const [showUpload, setShowUpload] = useState(false);
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
        onSuccess: (job) => setTrimmingJobId(job.id),
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
        },
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
            <span className="text-gray-400 animate-pulse" title="FastQC running...">
              ...
            </span>
          ) : (
            <span className="text-gray-300">{'\u2014'}</span>
          );
        }
        return (
          <button
            type="button"
            onClick={() => setFastqcTarget(row)}
            className="text-primary hover:text-primary/80"
            title="View FastQC Report"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        );
      },
    },
    {
      accessorKey: 'totalReads',
      header: 'Total Reads',
      cell: (info) => {
        const v = info.getValue<number | null>();
        return v != null ? v.toLocaleString() : '\u2014';
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
          className="text-gray-400 hover:text-red-500"
          title="Delete"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
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
        onSuccess: () => setDeleteTarget(null),
        onError: () => setDeleteError('Failed to delete file. Please try again.'),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            FASTQ Files
          </h3>
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => setShowUpload((prev) => !prev)}
            >
              {showUpload ? 'Close' : '+ Add FASTQs'}
            </Button>
          </div>
        </div>

        {showUpload && (
          <FileUploadZone
            experimentId={experiment.id}
            onUploadComplete={() => setShowUpload(false)}
          />
        )}

        {/* Adapter detection banner */}
        {showAdapterBanner && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
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
          <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span>
                Trimming in progress...{' '}
                {trimmingJob?.status === 'queued' ? '(queued)' : '(running)'}
              </span>
            </div>
          </div>
        )}

        {/* Trimming error banner */}
        {trimmingJob?.status === 'error' && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Trimming failed: {trimmingJob.errorMessage ?? 'Unknown error'}
          </div>
        )}

        {fastqs.length > 0 ? (
          <DataTable data={fastqs} columns={columnsWithActions} />
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">
            No FASTQ files uploaded yet. Click + Add FASTQs to get started.
          </p>
        )}
      </Card>

      <Modal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete FASTQ File"
      >
        <p className="mb-4 text-sm text-gray-700">
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
    </>
  );
}
