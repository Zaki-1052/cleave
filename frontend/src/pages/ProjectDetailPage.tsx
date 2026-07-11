// frontend/src/pages/ProjectDetailPage.tsx
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Crown, FolderX, UserPlus, Users } from 'lucide-react';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DataTable } from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
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
    cell: ({ getValue }) => (
      <span className="font-mono tabular-nums text-muted-foreground">
        {formatDate(getValue() as string)}
      </span>
    ),
  },
  { accessorKey: 'assayType', header: 'Assay' },
  {
    id: 'lastJob',
    header: 'Last Job',
    cell: () => <span className="text-muted-foreground">None</span>,
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
  const isReference = project?.isReference ?? false;

  if (isLoading) {
    return (
      <div>
        <div className="mb-6 flex items-end justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-2 h-8 w-56" />
          </div>
          <Skeleton className="h-9 w-40" />
        </div>
        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-64">
            <Card>
              <Skeleton className="h-2 w-full rounded-full" />
              <div className="my-4 border-t border-border" />
              <Skeleton className="h-3 w-24" />
              <div className="mt-3 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                ))}
              </div>
            </Card>
          </aside>
          <div className="min-w-0 flex-1">
            <Card>
              <Skeleton className="h-5 w-32" />
              <div className="mt-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <EmptyState
        icon={FolderX}
        title="Project not found"
        description="This project may have been deleted or you may not have access to it."
      />
    );
  }

  return (
    <div>
      <PageHeader
        title={project.name}
        eyebrow={isReference ? 'Reference Project' : 'Project'}
        actions={
          !isReference ? (
            <>
              {isAdmin && (
                <Button variant="outline" onClick={() => setIsMembersModalOpen(true)}>
                  <UserPlus className="h-4 w-4" />
                  Manage Members
                </Button>
              )}
              <Button onClick={() => setIsCreateModalOpen(true)}>+ Create Experiment</Button>
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full shrink-0 lg:w-64">
          <Card>
            {isReference && (
              <div className="mb-4 flex items-start gap-2 rounded-md border border-warning/25 bg-warning/10 px-3 py-2 text-xs text-foreground/80">
                <Crown className="mt-0.5 h-4 w-4 shrink-0 text-ember" />
                <span>Read-only reference project with pre-analyzed data.</span>
              </div>
            )}

            <StorageGauge
              usedBytes={project.storageBytes}
              quotaBytes={storageInfo?.quotaBytes}
              label="Project Size"
            />

            <div className="my-4 border-t border-border" />

            {isReference ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-4 w-4" />
                <span>Shared with all users</span>
              </div>
            ) : (
              <>
                <h3 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {members?.length ?? 0} Members
                </h3>
                <div className="space-y-3">
                  {members?.map((member) => (
                    <div key={member.userId} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                          {getInitials(member.user)}
                        </div>
                        <span className="text-sm text-foreground">{getDisplayName(member.user)}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {ROLE_LABELS[member.role] ?? member.role}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
          {!isReference && (
            <>
              <ManageMembersModal
                isOpen={isMembersModalOpen}
                onClose={() => setIsMembersModalOpen(false)}
                projectId={projectId}
              />
              <CreateExperimentWizard
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                projectId={projectId}
                isTrainingProject={project?.isTraining ?? false}
                onCreated={(experiment) => {
                  setIsCreateModalOpen(false);
                  navigate(`/experiments/${experiment.id}`);
                }}
              />
            </>
          )}
        </aside>

        <div className="min-w-0 flex-1">
          <Card>
            <h2 className="mb-4 font-display text-lg font-semibold text-foreground">Experiments</h2>
            <DataTable
              data={experimentsData?.items ?? []}
              columns={experimentColumns}
              emptyMessage="No experiments yet"
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
