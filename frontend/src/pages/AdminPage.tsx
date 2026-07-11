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
} from 'lucide-react';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Pagination } from '@/components/ui/Pagination';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
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

// ── Search Input ──────────────────────────────────────────────────────────

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Search..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-input bg-card py-1.5 pl-8 pr-3 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
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
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-3 h-8 w-20" />
              <Skeleton className="mt-2 h-3 w-12" />
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="h-3 w-28" />
              <div className="mt-4 space-y-2">
                {Array.from({ length: 4 }).map((_, r) => (
                  <Skeleton key={r} className="h-5 w-full" />
                ))}
              </div>
            </Card>
          ))}
        </div>
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
                <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {s.label}
                </p>
                <p className="mt-1.5 font-mono text-3xl font-semibold tabular-nums text-foreground">
                  {s.value}
                </p>
                {s.sub && (
                  <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">{s.sub}</p>
                )}
              </div>
              <s.icon className="h-5 w-5 shrink-0 text-muted-foreground/50" />
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Jobs by Status */}
        <Card>
          <h3 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Jobs by Status
          </h3>
          {Object.keys(stats.jobsByStatus).length === 0 ? (
            <EmptyState icon={Activity} title="No jobs yet" />
          ) : (
            <div className="space-y-2">
              {Object.entries(stats.jobsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <StatusBadge status={status} />
                  <span className="font-mono text-sm tabular-nums">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Storage */}
        <Card>
          <h3 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Storage
          </h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Project data</span>
              <span className="font-mono tabular-nums">{formatBytes(stats.storageUsedBytes)}</span>
            </div>
            {stats.storageQuotaBytes > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quota</span>
                <span className="font-mono tabular-nums">{formatBytes(stats.storageQuotaBytes)}</span>
              </div>
            )}
            <div className="my-2 border-t border-border" />
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Disk</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Used</span>
              <span className="font-mono tabular-nums">{formatBytes(stats.diskUsed)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Free</span>
              <span className="font-mono tabular-nums">{formatBytes(stats.diskFree)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total</span>
              <span className="font-mono tabular-nums">{formatBytes(stats.diskTotal)}</span>
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
  const [roleConfirm, setRoleConfirm] = useState(false);
  const [statusConfirm, setStatusConfirm] = useState(false);

  function confirmRole() {
    updateMutation.mutate(
      { userId: user.id, updates: { isSuperuser: !user.isSuperuser } },
      {
        onSuccess: () => {
          toast.success(`Updated ${user.email}`);
          setRoleConfirm(false);
        },
        onError: (err) => toast.error((err as Error).message || 'Update failed'),
      },
    );
  }

  function confirmStatus() {
    updateMutation.mutate(
      { userId: user.id, updates: { isActive: !user.isActive } },
      {
        onSuccess: () => {
          toast.success(`Updated ${user.email}`);
          setStatusConfirm(false);
        },
        onError: (err) => toast.error((err as Error).message || 'Update failed'),
      },
    );
  }

  return (
    <div className="flex gap-1">
      <button
        type="button"
        onClick={() => setRoleConfirm(true)}
        disabled={updateMutation.isPending}
        className="rounded-md px-2 py-0.5 text-xs font-medium text-warning transition-colors duration-150 hover:bg-warning/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {user.isSuperuser ? 'Demote' : 'Promote'}
      </button>
      <button
        type="button"
        onClick={() => setStatusConfirm(true)}
        disabled={updateMutation.isPending}
        className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors duration-150 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
          user.isActive
            ? 'text-destructive hover:bg-destructive/10'
            : 'text-success hover:bg-success/10'
        }`}
      >
        {user.isActive ? 'Deactivate' : 'Activate'}
      </button>
      <ConfirmDialog
        open={roleConfirm}
        onOpenChange={setRoleConfirm}
        title={user.isSuperuser ? 'Remove superuser?' : 'Promote to superuser?'}
        description={`${user.isSuperuser ? 'Remove superuser access from' : 'Grant superuser access to'} ${user.email}?`}
        confirmLabel={user.isSuperuser ? 'Demote' : 'Promote'}
        variant={user.isSuperuser ? 'destructive' : 'default'}
        loading={updateMutation.isPending}
        onConfirm={confirmRole}
      />
      <ConfirmDialog
        open={statusConfirm}
        onOpenChange={setStatusConfirm}
        title={user.isActive ? 'Deactivate user?' : 'Activate user?'}
        description={`${user.isActive ? 'Deactivate' : 'Activate'} ${user.email}?`}
        confirmLabel={user.isActive ? 'Deactivate' : 'Activate'}
        variant={user.isActive ? 'destructive' : 'default'}
        loading={updateMutation.isPending}
        onConfirm={confirmStatus}
      />
    </div>
  );
}

const userColumns: ColumnDef<AdminUser, unknown>[] = [
  { accessorKey: 'email', header: 'Email' },
  {
    id: 'name',
    header: 'Name',
    accessorFn: (row) => [row.firstName, row.lastName].filter(Boolean).join(' ') || '—',
  },
  {
    accessorKey: 'isSuperuser',
    header: 'Role',
    cell: ({ getValue }) => {
      const isSu = getValue<boolean>();
      return (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
            isSu
              ? 'bg-warning/10 text-warning ring-warning/25'
              : 'bg-muted text-muted-foreground ring-border'
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
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${
            active
              ? 'bg-success/10 text-success ring-success/25'
              : 'bg-destructive/10 text-destructive ring-destructive/25'
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
    cell: ({ getValue }) => <span className="font-mono tabular-nums">{getValue<number>()}</span>,
  },
  {
    accessorKey: 'createdAt',
    header: 'Joined',
    cell: ({ getValue }) => <span className="font-mono tabular-nums">{formatDateTime(getValue<string>())}</span>,
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
      <DataTable
        data={data?.items ?? []}
        columns={userColumns}
        isLoading={isLoading}
        showPagination={false}
        pageSize={(data?.items ?? []).length || PER_PAGE}
        emptyMessage="No users found"
      />
      <Pagination
        className="mt-2 border-t border-border px-4"
        page={page}
        pageSize={PER_PAGE}
        totalItems={data?.total ?? 0}
        onPageChange={setPage}
      />
    </Card>
  );
}

// ── Projects Tab ──────────────────────────────────────────────────────────

function ProjectActionsCell({ project }: { project: AdminProject }) {
  const deleteMutation = useDeleteAdminProject();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function confirmDelete() {
    deleteMutation.mutate(project.id, {
      onSuccess: () => {
        toast.success(`Deleted "${project.name}"`);
        setConfirmOpen(false);
      },
      onError: () => toast.error('Delete failed'),
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={deleteMutation.isPending}
        className="rounded-md p-2 text-muted-foreground transition-colors duration-150 hover:bg-destructive/10 hover:text-destructive disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Delete project ${project.name}`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete project?"
        description={`Delete "${project.name}" and ALL its data? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </>
  );
}

const projectColumns: ColumnDef<AdminProject, unknown>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'creatorEmail', header: 'Creator', cell: ({ getValue }) => getValue<string | null>() ?? '—' },
  { accessorKey: 'memberCount', header: 'Members', cell: ({ getValue }) => <span className="font-mono tabular-nums">{getValue<number>()}</span> },
  { accessorKey: 'experimentCount', header: 'Experiments', cell: ({ getValue }) => <span className="font-mono tabular-nums">{getValue<number>()}</span> },
  { accessorKey: 'storageBytes', header: 'Storage', cell: ({ getValue }) => <span className="font-mono tabular-nums">{formatBytes(getValue<number>())}</span> },
  { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <StatusBadge status={getValue<string>()} /> },
  { accessorKey: 'createdAt', header: 'Created', cell: ({ getValue }) => <span className="font-mono tabular-nums">{formatDateTime(getValue<string>())}</span> },
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
      <DataTable
        data={data?.items ?? []}
        columns={projectColumns}
        isLoading={isLoading}
        showPagination={false}
        pageSize={(data?.items ?? []).length || PER_PAGE}
        emptyMessage="No projects found"
      />
      <Pagination
        className="mt-2 border-t border-border px-4"
        page={page}
        pageSize={PER_PAGE}
        totalItems={data?.total ?? 0}
        onPageChange={setPage}
      />
    </Card>
  );
}

// ── Jobs Tab ──────────────────────────────────────────────────────────────

function JobActionsCell({ job }: { job: AdminJob }) {
  const terminateMutation = useTerminateAdminJob();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const canTerminate = job.status === 'queued' || job.status === 'running';

  if (!canTerminate) return null;

  function confirmTerminate() {
    terminateMutation.mutate(job.id, {
      onSuccess: () => {
        toast.success(`Terminated "${job.name}"`);
        setConfirmOpen(false);
      },
      onError: () => toast.error('Termination failed'),
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={terminateMutation.isPending}
        className="rounded-md px-2 py-0.5 text-xs font-medium text-destructive transition-colors duration-150 hover:bg-destructive/10 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Terminate
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Terminate job?"
        description={`Force-terminate "${job.name}"? This will stop the job immediately.`}
        confirmLabel="Terminate"
        variant="destructive"
        loading={terminateMutation.isPending}
        onConfirm={confirmTerminate}
      />
    </>
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
  { accessorKey: 'launcherEmail', header: 'Launched By', cell: ({ getValue }) => getValue<string | null>() ?? '—' },
  {
    accessorKey: 'startedAt',
    header: 'Started',
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
      <DataTable
        data={data?.items ?? []}
        columns={jobColumns}
        isLoading={isLoading}
        showPagination={false}
        pageSize={(data?.items ?? []).length || PER_PAGE}
        emptyMessage="No jobs found"
      />
      <Pagination
        className="mt-2 border-t border-border px-4"
        page={page}
        pageSize={PER_PAGE}
        totalItems={data?.total ?? 0}
        onPageChange={setPage}
      />
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
    <div className="space-y-6">
      <PageHeader title="Admin Panel" eyebrow="Administration" className="mb-0" />
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
