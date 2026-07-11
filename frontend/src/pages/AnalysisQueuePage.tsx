// frontend/src/pages/AnalysisQueuePage.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import { Search } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card } from '@/components/layout/Card';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { PageHeader } from '@/components/ui/PageHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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
  { value: 'rnaseq_trimming', label: 'Trimming (fastp)' },
  { value: 'rnaseq_alignment', label: 'Alignment (STAR)' },
  { value: 'rnaseq_feature_counts', label: 'featureCounts' },
  { value: 'rnaseq_de', label: 'DE Analysis' },
  { value: 'rnaseq_qc', label: 'QC Dashboard' },
  { value: 'rnaseq_pathway', label: 'Pathway Analysis' },
];

const JOB_TYPE_TO_TAB: Record<string, string> = {
  alignment: 'alignment',
  trimming: 'trimming',
  peak_calling: 'peaks',
  diffbind: 'diffbind',
  custom_heatmap: 'heatmaps',
  pearson_correlation: 'correlations',
  roman_normalization: 'normalization',
  rnaseq_trimming: 'trimming',
  rnaseq_alignment: 'alignment',
  rnaseq_feature_counts: 'feature-counts',
  rnaseq_de: 'de',
  rnaseq_qc: 'rnaseq-qc',
  rnaseq_pathway: 'pathway',
};

function ActionsCell({ job }: { job: QueueJob }) {
  const terminateMutation = useTerminateJob();
  const retryMutation = useRetryJob();
  const [confirmTerminate, setConfirmTerminate] = useState(false);

  const canTerminate = job.status === 'queued' || job.status === 'running';
  const canRetry = job.status === 'error' || job.status === 'terminated';

  if (!canTerminate && !canRetry) return null;

  return (
    <div className="flex gap-1">
      {canTerminate && (
        <button
          type="button"
          onClick={() => setConfirmTerminate(true)}
          disabled={terminateMutation.isPending}
          className="rounded-md px-2 py-0.5 text-xs font-medium text-destructive transition-colors duration-150 hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Terminate
        </button>
      )}
      {canRetry && (
        <button
          type="button"
          onClick={() => retryMutation.mutate(job.id)}
          disabled={retryMutation.isPending}
          className="rounded-md px-2 py-0.5 text-xs font-medium text-primary transition-colors duration-150 hover:bg-accent disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Retry
        </button>
      )}
      <ConfirmDialog
        open={confirmTerminate}
        onOpenChange={setConfirmTerminate}
        title="Terminate job?"
        description={`Force-terminate "${job.name}"? This will stop the job immediately.`}
        confirmLabel="Terminate"
        variant="destructive"
        loading={terminateMutation.isPending}
        onConfirm={() =>
          terminateMutation.mutate(job.id, {
            onSuccess: () => setConfirmTerminate(false),
          })
        }
      />
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
    accessorFn: (row) => (row.launcher ? getDisplayName(row.launcher) : '—'),
  },
  {
    accessorKey: 'startedAt',
    header: 'Started Running',
    cell: ({ getValue }) => {
      const v = getValue<string | null>();
      return v ? <span className="font-mono tabular-nums">{formatDateTime(v)}</span> : '—';
    },
  },
  {
    accessorKey: 'durationSeconds',
    header: 'Duration',
    cell: ({ getValue }) => {
      const v = getValue<number | null>();
      return v != null ? <span className="font-mono tabular-nums">{formatDuration(v)}</span> : '—';
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

  return (
    <div>
      <PageHeader title="Analysis Queue" eyebrow="Jobs" />
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
          <div className="relative">
            <input
              type="text"
              placeholder="Search..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="rounded-md border border-input bg-card py-1.5 pl-8 pr-3 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
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

        <DataTable
          data={jobs}
          columns={columns}
          isLoading={isLoading}
          showPagination={false}
          pageSize={jobs.length || PER_PAGE}
          emptyMessage="No jobs found"
          onRowClick={(job) => {
            const tab = JOB_TYPE_TO_TAB[job.jobType] ?? 'files';
            navigate(`/experiments/${job.experimentId}/${tab}/${job.id}`);
          }}
        />

        {total > 0 && (
          <Pagination
            className="mt-2 border-t border-border px-4"
            page={page}
            pageSize={PER_PAGE}
            totalItems={total}
            onPageChange={setPage}
          />
        )}
      </Card>
    </div>
  );
}
