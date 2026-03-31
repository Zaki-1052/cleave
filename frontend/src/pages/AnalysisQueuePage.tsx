// frontend/src/pages/AnalysisQueuePage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Search, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Spinner } from '@/components/ui/Spinner';
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
  { value: 'trimming', label: 'Trimming' },
  { value: 'alignment', label: 'Alignment' },
  { value: 'peak_calling', label: 'Peak Calling' },
  { value: 'roman_normalization', label: 'Normalization' },
  { value: 'diffbind', label: 'DiffBind' },
  { value: 'custom_heatmap', label: 'Custom Heatmap' },
  { value: 'pearson_correlation', label: 'Correlation' },
];

const JOB_TYPE_TO_TAB: Record<string, string> = {
  alignment: 'alignment',
  trimming: 'fastqs',
  peak_calling: 'peaks',
  diffbind: 'diffbind',
  custom_heatmap: 'heatmaps',
  pearson_correlation: 'correlations',
  roman_normalization: 'normalization',
};

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
          className="rounded px-2 py-0.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950 disabled:opacity-50"
        >
          Terminate
        </button>
      )}
      {canRetry && (
        <button
          type="button"
          onClick={() => retryMutation.mutate(job.id)}
          disabled={retryMutation.isPending}
          className="rounded px-2 py-0.5 text-xs text-primary hover:bg-blue-50 dark:hover:bg-blue-950 disabled:opacity-50"
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
      return v ? <span className="font-mono">{formatDateTime(v)}</span> : '\u2014';
    },
  },
  {
    accessorKey: 'durationSeconds',
    header: 'Duration',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? <span className="font-mono">{formatDuration(v)}</span> : '\u2014';
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
  const navigate = useNavigate();
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
        <h2 className="font-display text-lg font-semibold text-primary">Analysis Queue</h2>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="rounded-md border border-border py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          </div>
          <Select
            value={jobTypeFilter || '__all'}
            onValueChange={(val) => { setJobTypeFilter(val === '__all' ? '' : val); setPage(1); }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JOB_TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value || '__all'} value={opt.value || '__all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={statusFilter || '__all'}
            onValueChange={(val) => { setStatusFilter(val === '__all' ? '' : val); setPage(1); }}
          >
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value || '__all'} value={opt.value || '__all'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner size="lg" />
        </div>
      ) : jobs.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">No jobs found.</p>
      ) : (
        <DataTable
          data={jobs}
          columns={columns}
          pageSize={jobs.length}
          onRowClick={(job) => {
            const tab = JOB_TYPE_TO_TAB[job.jobType] ?? 'files';
            navigate(`/experiments/${job.experimentId}/${tab}/${job.id}`);
          }}
        />
      )}

      {total > 0 && (
        <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
          <span>Records per page: {PER_PAGE}</span>
          <div className="flex items-center gap-2">
            <span>
              {rangeStart}-{rangeEnd} of {total}
            </span>
            <button
              onClick={() => setPage(1)}
              disabled={page === 1}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded p-1 hover:bg-muted disabled:opacity-30"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
