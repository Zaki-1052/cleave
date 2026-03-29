// frontend/src/pages/experiment/HistoryTab.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';

import { Card } from '@/components/layout/Card';
import { DataTable } from '@/components/ui/DataTable';
import { useExperimentHistory } from '@/hooks/useExperimentHistory';
import { formatDateTime, getDisplayName } from '@/lib/utils';
import type { Experiment, ExperimentEvent } from '@/api/types';

const ACTION_LABELS: Record<string, string> = {
  fastq_uploaded: 'FASTQ Uploaded',
  fastq_deleted: 'FASTQ Deleted',
  reaction_created: 'Reaction Created',
  reactions_imported: 'Reactions Imported',
  reaction_updated: 'Reaction Updated',
  reaction_deleted: 'Reaction Deleted',
  job_launched: 'Job Launched',
  job_completed: 'Job Completed',
  job_failed: 'Job Failed',
  metadata_updated: 'Metadata Updated',
};

const ACTION_COLORS: Record<string, string> = {
  fastq_uploaded: 'text-blue-600',
  fastq_deleted: 'text-red-600',
  reaction_created: 'text-green-600',
  reactions_imported: 'text-blue-600',
  reaction_updated: 'text-muted-foreground',
  reaction_deleted: 'text-red-600',
  job_launched: 'text-blue-600',
  job_completed: 'text-green-600',
  job_failed: 'text-red-600',
  metadata_updated: 'text-muted-foreground',
};

export default function HistoryTab() {
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const { data, isLoading } = useExperimentHistory(experiment.id, 1, 100);

  const columns = useMemo<ColumnDef<ExperimentEvent, unknown>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'Date',
        cell: (info) => formatDateTime(info.getValue<string>()),
      },
      {
        id: 'user',
        header: 'User',
        cell: (info) => {
          const event = info.row.original;
          if (!event.user) return <span className="text-muted-foreground">System</span>;
          return getDisplayName(event.user);
        },
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: (info) => {
          const action = info.getValue<string>();
          const label = ACTION_LABELS[action] ?? action;
          const color = ACTION_COLORS[action] ?? 'text-muted-foreground';
          return <span className={`font-medium ${color}`}>{label}</span>;
        },
      },
      {
        accessorKey: 'detail',
        header: 'Details',
        cell: (info) => info.getValue<string>() ?? '—',
      },
    ],
    [],
  );

  if (isLoading) {
    return (
      <Card>
        <p className="py-8 text-center text-sm text-muted-foreground">Loading history...</p>
      </Card>
    );
  }

  const events = data?.items ?? [];

  return (
    <Card>
      <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        History
      </h3>
      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No history events yet
        </p>
      ) : (
        <DataTable data={events} columns={columns} pageSize={25} />
      )}
    </Card>
  );
}
