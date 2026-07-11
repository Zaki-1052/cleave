// frontend/src/pages/experiment/HistoryTab.tsx
import { type ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { History } from 'lucide-react';

import { Card } from '@/components/layout/Card';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
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
  fastq_uploaded: 'text-info',
  fastq_deleted: 'text-destructive',
  reaction_created: 'text-success',
  reactions_imported: 'text-info',
  reaction_updated: 'text-muted-foreground',
  reaction_deleted: 'text-destructive',
  job_launched: 'text-info',
  job_completed: 'text-success',
  job_failed: 'text-destructive',
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
        cell: (info) => (
          <span className="font-mono text-xs text-muted-foreground">
            {formatDateTime(info.getValue<string>())}
          </span>
        ),
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

  const events = data?.items ?? [];

  return (
    <Card>
      <h3 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        History
      </h3>
      {!isLoading && events.length === 0 ? (
        <EmptyState
          icon={History}
          title="No history yet"
          description="Events will appear here as work happens on this experiment."
        />
      ) : (
        <DataTable data={events} columns={columns} pageSize={25} isLoading={isLoading} />
      )}
    </Card>
  );
}
