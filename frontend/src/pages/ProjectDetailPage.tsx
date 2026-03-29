// frontend/src/pages/ProjectDetailPage.tsx
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ManageMembersModal } from '@/components/projects/ManageMembersModal';
import { CreateExperimentWizard } from '@/components/experiments/CreateExperimentWizard';
import { StorageGauge } from '@/components/ui/StorageGauge';
import { useAuth } from '@/hooks/useAuth';
import { useProject, useMembers, useStorageInfo } from '@/hooks/useProjects';
import { useExperiments } from '@/hooks/useExperiments';
import { formatDate, getDisplayName, getInitials } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/constants';
import type { ColumnDef } from '@tanstack/react-table';
import type { Experiment } from '@/api/types';

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
    id: 'lastJob',
    header: 'Last Job',
    cell: () => <span className="text-gray-400">None</span>,
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ getValue }) => <StatusBadge status={getValue() as string} />,
  },
];

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const { user: currentUser } = useAuth();
  const { data: project, isLoading } = useProject(projectId);
  const { data: members } = useMembers(projectId);
  const { data: experimentsData } = useExperiments(projectId);
  const { data: storageInfo } = useStorageInfo();
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const navigate = useNavigate();

  const currentMember = members?.find((m) => m.userId === currentUser?.id);
  const isAdmin = currentMember?.role === 'admin';

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner size="lg" />
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
          <h2 className="font-display text-lg font-bold text-gray-800">{project.name}</h2>
          <div className="mt-2">
            <StorageGauge
              usedBytes={project.storageBytes}
              quotaBytes={storageInfo?.quotaBytes}
              label="Project Size"
            />
          </div>

          <hr className="my-4" />

          <h3 className="mb-3 text-sm font-semibold text-gray-600">
            {members?.length ?? 0} Members
          </h3>
          <div className="space-y-3">
            {members?.map((member) => (
              <div key={member.userId} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-teal text-xs font-semibold text-white ring-2 ring-white shadow-sm">
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

          {isAdmin && (
            <button
              className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              onClick={() => setIsMembersModalOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
              Manage Members
            </button>
          )}
        </Card>
        <ManageMembersModal
          isOpen={isMembersModalOpen}
          onClose={() => setIsMembersModalOpen(false)}
          projectId={projectId}
        />
        <CreateExperimentWizard
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          projectId={projectId}
          onCreated={(experiment) => {
            setIsCreateModalOpen(false);
            navigate(`/experiments/${experiment.id}`);
          }}
        />
      </aside>

      <div className="flex-1">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-primary">Experiments</h2>
            <Button onClick={() => setIsCreateModalOpen(true)}>+ Create Experiment</Button>
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
