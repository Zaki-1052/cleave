// frontend/src/pages/ProjectDetailPage.tsx
import { Link, useParams } from 'react-router-dom';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useProject, useMembers } from '@/hooks/useProjects';
import { useExperiments } from '@/hooks/useExperiments';
import { formatBytes, formatDate } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/constants';
import type { ColumnDef } from '@tanstack/react-table';
import type { Experiment, MemberUser } from '@/api/types';

function getInitials(user: MemberUser): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
  }
  return user.email.substring(0, 2).toUpperCase();
}

function getDisplayName(user: MemberUser): string {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }
  return user.email;
}

const experimentColumns: ColumnDef<Experiment, unknown>[] = [
  {
    accessorKey: 'name',
    header: 'Name',
    cell: ({ row }) => (
      <Link
        to={`/experiments/${row.original.id}`}
        className="text-primary hover:underline"
      >
        {row.original.name}
      </Link>
    ),
  },
  {
    accessorKey: 'updatedAt',
    header: 'Modified',
    cell: ({ getValue }) => formatDate(getValue() as string),
  },
  { accessorKey: 'assayType', header: 'Assay' },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
  },
];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { data: project, isLoading } = useProject(projectId);
  const { data: members } = useMembers(projectId);
  const { data: experimentsData } = useExperiments(projectId);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!project) {
    return (
      <Card>
        <p className="text-gray-500">Project not found</p>
      </Card>
    );
  }

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0">
        <Card>
          <h2 className="text-lg font-bold text-gray-800">{project.name}</h2>
          <p className="mt-1 text-xs uppercase tracking-wide text-gray-500">Project Size</p>
          <p className="text-sm text-gray-700">{formatBytes(project.storageBytes)}</p>

          <hr className="my-4" />

          <h3 className="mb-3 text-sm font-semibold text-gray-600">
            {members?.length ?? 0} Members
          </h3>
          <div className="space-y-3">
            {members?.map((member) => (
              <div key={member.userId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-teal text-xs font-semibold text-white">
                    {getInitials(member.user)}
                  </div>
                  <span className="text-sm text-gray-700">{getDisplayName(member.user)}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {ROLE_LABELS[member.role] ?? member.role}
                </span>
              </div>
            ))}
          </div>

          <button className="mt-4 text-sm text-primary hover:underline">+ Manage Members</button>
        </Card>
      </aside>

      <div className="flex-1">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Experiments</h2>
            <Button>+ Create Experiment</Button>
          </div>
          {!experimentsData?.items.length ? (
            <p className="py-8 text-center text-sm text-gray-400">
              No experiments yet. Create one to get started.
            </p>
          ) : (
            <DataTable data={experimentsData.items} columns={experimentColumns} />
          )}
        </Card>
      </div>
    </div>
  );
}
