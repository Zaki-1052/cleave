// frontend/src/pages/HomePage.tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, FolderPlus } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { CreateProjectModal } from '@/components/projects/CreateProjectModal';
import { useProjects } from '@/hooks/useProjects';
import { formatBytes, formatDate } from '@/lib/utils';

export default function HomePage() {
  const { data, isLoading } = useProjects();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0">
        <Card>
          <h2 className="mb-4 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Projects Filters
          </h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Coming soon</span>
          </div>
        </Card>
      </aside>

      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="font-display text-xl font-bold text-foreground">Projects</h1>
          <Button onClick={() => setIsCreateModalOpen(true)}>+ Create Project</Button>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : data?.items.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <FolderPlus className="mb-2 h-10 w-10" />
              <p className="text-sm">No projects yet. Create one to get started.</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data?.items.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`}>
                <Card className="cursor-pointer border border-transparent transition-all duration-150 hover:-translate-y-0.5 hover:border-accent-gold hover:shadow-md">
                  <h3 className="text-lg font-semibold text-foreground">{project.name}</h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Modified {formatDate(project.updatedAt)}</span>
                    <span className="font-mono">{formatBytes(project.storageBytes)}</span>
                  </div>
                  {project.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}

        <CreateProjectModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
        />
      </div>
    </div>
  );
}
