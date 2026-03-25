// frontend/src/pages/experiment/FastqsTab.tsx
import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { Modal } from '@/components/ui/Modal';
import { FileUploadZone } from '@/components/fastqs/FileUploadZone';
import { FastqcReportModal } from '@/components/fastqs/FastqcReportModal';
import { useFastqs, useDeleteFastq } from '@/hooks/useFastqs';
import { formatBytes, formatDate } from '@/lib/utils';
import type { Experiment, FastqFile } from '@/api/types';

interface ExperimentContext {
  experiment: Experiment;
}

const staticColumns: ColumnDef<FastqFile, unknown>[] = [
  {
    accessorKey: 'filename',
    header: 'Name',
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

export default function FastqsTab() {
  const { experiment } = useOutletContext<ExperimentContext>();
  const { data, isLoading } = useFastqs(experiment.id);
  const deleteMutation = useDeleteFastq();
  const [showUpload, setShowUpload] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FastqFile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [fastqcTarget, setFastqcTarget] = useState<FastqFile | null>(null);

  const fastqs = data?.items ?? [];

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
    </>
  );
}
