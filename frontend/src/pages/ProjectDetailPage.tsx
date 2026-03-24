// frontend/src/pages/ProjectDetailPage.tsx
import { useParams } from 'react-router-dom';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { useProject } from '@/hooks/useProjects';
import { formatBytes } from '@/lib/utils';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: project, isLoading } = useProject(Number(id));

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!project) {
    return <Card><p className="text-gray-500">Project not found</p></Card>;
  }

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0">
        <Card>
          <h2 className="text-lg font-bold text-gray-800">{project.name}</h2>
          <p className="mt-1 text-xs text-gray-500">
            Project Size: {formatBytes(project.storageBytes)}
          </p>
          <hr className="my-4" />
          <h3 className="mb-2 text-sm font-semibold text-gray-600">Members</h3>
          <p className="text-sm text-gray-400">Not yet implemented</p>
        </Card>
      </aside>

      <div className="flex-1">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Experiments</h2>
            <Button>+ Create Experiment</Button>
          </div>
          <p className="text-sm text-gray-400">Not yet implemented</p>
        </Card>
      </div>
    </div>
  );
}
