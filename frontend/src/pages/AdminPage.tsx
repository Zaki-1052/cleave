// frontend/src/pages/AdminPage.tsx
import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Users,
  FolderKanban,
  FlaskConical,
  Activity,
  HardDrive,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { useAuth } from '@/hooks/useAuth';
import {
  useAdminStats,
  useAdminUsers,
  useUpdateAdminUser,
  useAdminProjects,
  useDeleteAdminProject,
  useAdminJobs,
  useTerminateAdminJob,
  useTriggerCleanup,
} from '@/hooks/useAdmin';
import type { AdminUser, AdminProject, AdminJob } from '@/api/admin';
import { formatBytes, formatDateTime, formatDuration } from '@/lib/utils';

const PER_PAGE = 25;

// ── Pagination Controls ───────────────────────────────────────────────────

function PaginationBar({
  page,
  setPage,
  total,
}: {
  page: number;
  setPage: (p: number) => void;
  total: number;
}) {
  const totalPages = Math.ceil(total / PER_PAGE);
  const rangeStart = total > 0 ? (page - 1) * PER_PAGE + 1 : 0;
  const rangeEnd = Math.min(page * PER_PAGE, total);

  if (total === 0) return null;

  return (
    <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
      <span>
        {rangeStart}-{rangeEnd} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button onClick={() => setPage(1)} disabled={page === 1} className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronsLeft className="h-4 w-4" />
        </button>
        <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button onClick={() => setPage(totalPages)} disabled={page >= totalPages} className="rounded p-1 hover:bg-muted disabled:opacity-30">
          <ChevronsRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ── Search Input ──────────────────────────────────────────────────────────

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
      />
      <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

// ── System Tab ────────────────────────────────────────────────────────────

function SystemTab() {
  const { data: stats, isLoading } = useAdminStats();
  const cleanupMutation = useTriggerCleanup();

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const statCards = [
    { label: 'Users', value: stats.totalUsers, sub: `${stats.activeUsers} active`, icon: Users },
    { label: 'Projects', value: stats.totalProjects, icon: FolderKanban },
    { label: 'Experiments', value: stats.totalExperiments, icon: FlaskConical },
    { label: 'Jobs', value: stats.totalJobs, icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="font-display text-2xl font-bold">{s.value}</p>
                {s.sub && <p className="text-xs text-muted-foreground">{s.sub}</p>}
              </div>
              <s.icon className="h-5 w-5 text-muted-foreground/50" />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Jobs by Status */}
        <Card>
          <h3 className="mb-3 font-display text-sm font-semibold">Jobs by Status</h3>
          {Object.keys(stats.jobsByStatus).length === 0 ? (
            <p className="text-sm text-muted-foreground">No jobs yet.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(stats.jobsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <StatusBadge status={status} />
                  <span className="font-mono text-sm">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Storage */}
        <Card>
          <h3 className="mb-3 font-display text-sm font-semibold">Storage</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Project data</span>
              <span className="font-mono">{formatBytes(stats.storageUsedBytes)}</span>
            </div>
            {stats.storageQuotaBytes > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quota</span>
                <span className="font-mono">{formatBytes(stats.storageQuotaBytes)}</span>
              </div>
            )}
            <div className="my-2 border-t border-border" />
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Disk</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Used</span>
              <span className="font-mono">{formatBytes(stats.diskUsed)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Free</span>
              <span className="font-mono">{formatBytes(stats.diskFree)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono">{formatBytes(stats.diskTotal)}</span>
            </div>
            {stats.diskTotal > 0 && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (stats.diskUsed / stats.diskTotal) * 100)}%` }}
                />
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            loading={cleanupMutation.isPending}
            onClick={() => {
              cleanupMutation.mutate(undefined, {
                onSuccess: () => toast.success('Cleanup completed'),
                onError: () => toast.error('Cleanup failed'),
              });
            }}
          >
            Run Cleanup
          </Button>
        </Card>
      </div>
    </div>
  );
}

// ── Users Tab ─────────────────────────────────────────────────────────────

function UserActionsCell({ user }: { user: AdminUser }) {
  const updateMutation = useUpdateAdminUser();

  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => {
          const action = user.isSuperuser ? 'Remove superuser from' : 'Promote to superuser';
          if (window.confirm(`${action} ${user.email}?`)) {
            updateMutation.mutate(
              { userId: user.id, updates: { isSuperuser: !user.isSuperuser } },
              {
                onSuccess: () => toast.success(`Updated ${user.email}`),
                onError: (err) => toast.error((err as Error).message || 'Update failed'),
              },
            );
          }
        }}
        disabled={updateMutation.isPending}
        className="rounded px-2 py-0.5 text-xs text-amber-600 hover:bg-amber-50 disabled:opacity-50 dark:text-amber-400 dark:hover:bg-amber-950"
      >
        {user.isSuperuser ? 'Demote' : 'Promote'}
      </button>
      <button
        type="button"
        onClick={() => {
          const action = user.isActive ? 'Deactivate' : 'Activate';
          if (window.confirm(`${action} ${user.email}?`)) {
            updateMutation.mutate(
              { userId: user.id, updates: { isActive: !user.isActive } },
              {
                onSuccess: () => toast.success(`Updated ${user.email}`),
                onError: (err) => toast.error((err as Error).message || 'Update failed'),
              },
            );
          }
        }}
        disabled={updateMutation.isPending}
        className={`rounded px-2 py-0.5 text-xs disabled:opacity-50 ${
          user.isActive
            ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950'
            : 'text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950'
        }`}
      >
        {user.isActive ? 'Deactivate' : 'Activate'}
      </button>
    </div>
  );
}

const userColumns: ColumnDef<AdminUser, unknown>[] = [
  { accessorKey: 'email', header: 'Email' },
  {
    id: 'name',
    header: 'Name',
    accessorFn: (row) => [row.firstName, row.lastName].filter(Boolean).join(' ') || '\u2014',
  },
  {
    accessorKey: 'isSuperuser',
    header: 'Role',
    cell: ({ getValue }) => {
      const isSu = getValue<boolean>();
      return (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            isSu
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
              : 'bg-muted text-muted-foreground'
          }`}
        >
          {isSu ? 'Superuser' : 'User'}
        </span>
      );
    },
  },
  {
    accessorKey: 'isActive',
    header: 'Status',
    cell: ({ getValue }) => {
      const active = getValue<boolean>();
      return (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            active
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
          }`}
        >
          {active ? 'Active' : 'Inactive'}
        </span>
      );
    },
  },
  {
    accessorKey: 'projectCount',
    header: 'Projects',
    cell: ({ getValue }) => <span className="font-mono">{getValue<number>()}</span>,
  },
  {
    accessorKey: 'createdAt',
    header: 'Joined',
    cell: ({ getValue }) => <span className="font-mono">{formatDateTime(getValue<string>())}</span>,
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => <UserActionsCell user={row.original} />,
  },
];

function UsersTab() {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [activeFilter, setActiveFilter] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchText); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const { data, isLoading } = useAdminUsers(
    page,
    PER_PAGE,
    debouncedSearch || undefined,
    roleFilter || undefined,
    activeFilter || undefined,
  );

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">All Users</h3>
        <div className="flex items-center gap-3">
          <SearchInput value={searchText} onChange={setSearchText} />
          <Select value={roleFilter || '__all'} onValueChange={(v) => { setRoleFilter(v === '__all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Roles</SelectItem>
              <SelectItem value="superuser">Superuser</SelectItem>
              <SelectItem value="regular">Regular</SelectItem>
            </SelectContent>
          </Select>
          <Select value={activeFilter || '__all'} onValueChange={(v) => { setActiveFilter(v === '__all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <DataTable data={data?.items ?? []} columns={userColumns} pageSize={(data?.items ?? []).length} />
      )}
      <PaginationBar page={page} setPage={setPage} total={data?.total ?? 0} />
    </Card>
  );
}

// ── Projects Tab ──────────────────────────────────────────────────────────

function ProjectActionsCell({ project }: { project: AdminProject }) {
  const deleteMutation = useDeleteAdminProject();

  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(`Delete project "${project.name}" and ALL its data? This cannot be undone.`)) {
          deleteMutation.mutate(project.id, {
            onSuccess: () => toast.success(`Deleted "${project.name}"`),
            onError: () => toast.error('Delete failed'),
          });
        }
      }}
      disabled={deleteMutation.isPending}
      className="rounded p-1 text-red-500 hover:bg-red-50 disabled:opacity-50 dark:hover:bg-red-950"
      aria-label="Delete project"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

const projectColumns: ColumnDef<AdminProject, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'creatorEmail', header: 'Creator', cell: ({ getValue }) => getValue<string | null>() ?? '\u2014' },
  { accessorKey: 'memberCount', header: 'Members', cell: ({ getValue }) => <span className="font-mono">{getValue<number>()}</span> },
  { accessorKey: 'experimentCount', header: 'Experiments', cell: ({ getValue }) => <span className="font-mono">{getValue<number>()}</span> },
  { accessorKey: 'storageBytes', header: 'Storage', cell: ({ getValue }) => <span className="font-mono">{formatBytes(getValue<number>())}</span> },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
  { accessorKey: 'createdAt', header: 'Created', cell: ({ getValue }) => <span className="font-mono">{formatDateTime(getValue<string>())}</span> },
  { id: 'actions', header: '', cell: ({ row }) => <ProjectActionsCell project={row.original} /> },
];

function ProjectsTab() {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchText); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const { data, isLoading } = useAdminProjects(page, PER_PAGE, debouncedSearch || undefined);

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">All Projects</h3>
        <SearchInput value={searchText} onChange={setSearchText} />
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <DataTable data={data?.items ?? []} columns={projectColumns} pageSize={(data?.items ?? []).length} />
      )}
      <PaginationBar page={page} setPage={setPage} total={data?.total ?? 0} />
    </Card>
  );
}

// ── Jobs Tab ──────────────────────────────────────────────────────────────

function JobActionsCell({ job }: { job: AdminJob }) {
  const terminateMutation = useTerminateAdminJob();
  const canTerminate = job.status === 'queued' || job.status === 'running';

  if (!canTerminate) return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (window.confirm(`Force-terminate "${job.name}"?`)) {
          terminateMutation.mutate(job.id, {
            onSuccess: () => toast.success(`Terminated "${job.name}"`),
            onError: () => toast.error('Termination failed'),
          });
        }
      }}
      disabled={terminateMutation.isPending}
      className="rounded px-2 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-950"
    >
      Terminate
    </button>
  );
}

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'queued', label: 'Queued' },
  { value: 'running', label: 'Running' },
  { value: 'complete', label: 'Complete' },
  { value: 'error', label: 'Error' },
  { value: 'terminated', label: 'Terminated' },
];

const jobColumns: ColumnDef<AdminJob, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'projectName', header: 'Project' },
  { accessorKey: 'experimentName', header: 'Experiment' },
  { accessorKey: 'jobType', header: 'Type' },
  { accessorKey: 'launcherEmail', header: 'Launched By', cell: ({ getValue }) => getValue<string | null>() ?? '\u2014' },
  {
    accessorKey: 'startedAt',
    header: 'Started',
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
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
  { id: 'actions', header: '', cell: ({ row }) => <JobActionsCell job={row.original} /> },
];

function JobsTab() {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(searchText); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchText]);

  const { data, isLoading } = useAdminJobs(
    page,
    PER_PAGE,
    debouncedSearch || undefined,
    statusFilter || undefined,
  );

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg font-semibold">All Jobs</h3>
        <div className="flex items-center gap-3">
          <SearchInput value={searchText} onChange={setSearchText} />
          <Select value={statusFilter || '__all'} onValueChange={(v) => { setStatusFilter(v === '__all' ? '' : v); setPage(1); }}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value || '__all'} value={opt.value || '__all'}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Spinner size="lg" /></div>
      ) : (
        <DataTable data={data?.items ?? []} columns={jobColumns} pageSize={(data?.items ?? []).length} />
      )}
      <PaginationBar page={page} setPage={setPage} total={data?.total ?? 0} />
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────

export default function AdminPage() {
  const { user } = useAuth();

  if (!user?.isSuperuser) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl font-bold text-foreground">Admin Panel</h2>
      <Tabs defaultValue="system">
        <TabsList>
          <TabsTrigger value="system">System</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
        </TabsList>
        <TabsContent value="system"><SystemTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="projects"><ProjectsTab /></TabsContent>
        <TabsContent value="jobs"><JobsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
