// frontend/src/pages/AnalysisQueuePage.tsx
import { useState, useEffect } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Card } from '@/components/layout/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAllJobs, useTerminateJob, useRetryJob } from '@/hooks/useJobs';
import { formatDateTime, formatDuration, getDisplayName } from '@/lib/utils';
import type { QueueJob } from '@/api/types';

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'complete', label: 'Complete' },
  { value: 'error', label: 'Error' },
  { value: 'terminated', label: 'Terminated' },
];

const JOB_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'alignment', label: 'Alignment' },
  { value: 'trimming', label: 'Trimming' },
  { value: 'peak_calling', label: 'Peak Calling' },
];

function ActionsCell({ job }: { job: QueueJob }) {
  const terminateMutation = useTerminateJob();
  const retryMutation = useRetryJob();

  const canTerminate = job.status === 'queued' || job.status === 'running';
  const canRetry = job.status === 'error' || job.status === 'terminated';

  if (!canTerminate && !canRetry) return null;

  return (
    <div className="flex gap-1">
      {canTerminate && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm(`Terminate "${job.name}"?`)) {
              terminateMutation.mutate(job.id);
            }
          }}
          disabled={terminateMutation.isPending}
          className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
        >
          Terminate
        </button>
      )}
      {canRetry && (
        <button
          type="button"
          onClick={() => retryMutation.mutate(job.id)}
          disabled={retryMutation.isPending}
          className="rounded px-2 py-0.5 text-xs text-primary hover:bg-blue-50 disabled:opacity-50"
        >
          Retry
        </button>
      )}
    </div>
  );
}

const columns: ColumnDef<QueueJob, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'projectName', header: 'Project' },
  { accessorKey: 'experimentName', header: 'Experiment' },
  { accessorKey: 'jobType', header: 'Executable' },
  {
    id: 'launchedByName',
    header: 'Launched By',
    accessorFn: (row) => (row.launcher ? getDisplayName(row.launcher) : '\u2014'),
  },
  {
    accessorKey: 'startedAt',
    header: 'Started Running',
    cell: ({ getValue }) => {
      const v = getValue<string | null>();
      return v ? formatDateTime(v) : '\u2014';
    },
  },
  {
    accessorKey: 'durationSeconds',
    header: 'Duration',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? formatDuration(v) : '\u2014';
    },
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <ActionsCell job={row.original} />,
  },
];

const PER_PAGE = 25;

export default function AnalysisQueuePage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [jobTypeFilter, setJobTypeFilter] = useState<string>('');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input for server-side filtering
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const { data, isLoading } = useAllJobs(
    page,
    PER_PAGE,
    statusFilter || undefined,
    jobTypeFilter || undefined,
    debouncedSearch || undefined,
  );
  const jobs = data?.items ?? [];
  const total = data?.total ?? 0;

  const totalPages = Math.ceil(total / PER_PAGE);
  const rangeStart = total > 0 ? (page - 1) * PER_PAGE + 1 : 0;
  const rangeEnd = Math.min(page * PER_PAGE, total);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary">Analysis Queue</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <svg
              className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <select
            value={jobTypeFilter}
            onChange={(e) => {
              setJobTypeFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-gray-300 py-1.5 pl-3 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {JOB_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="rounded-md border border-gray-300 py-1.5 pl-3 pr-8 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="py-12 text-center text-sm text-gray-400">Loading...</p>
      ) : jobs.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">No jobs found.</p>
      ) : (
        <DataTable data={jobs} columns={columns} pageSize={jobs.length} />
      )}

      {total > 0 && (
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-gray-600">
          <span>Records per page: {PER_PAGE}</span>
          <div className="flex items-center gap-2">
            <span>
              {rangeStart}-{rangeEnd} of {total}
            </span>
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="rounded px-1 py-0.5 hover:bg-gray-100 disabled:opacity-30"
            >
              |&lsaquo;
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded px-1 py-0.5 hover:bg-gray-100 disabled:opacity-30"
            >
              &lsaquo;
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded px-1 py-0.5 hover:bg-gray-100 disabled:opacity-30"
            >
              &rsaquo;
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded px-1 py-0.5 hover:bg-gray-100 disabled:opacity-30"
            >
              &rsaquo;|
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
