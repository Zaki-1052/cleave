// frontend/src/pages/HomePage.tsx
import { Link } from 'react-router-dom';
import { Card } from '@/components/layout/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Button } from '@/components/ui/Button';
import { useProjects } from '@/hooks/useProjects';
import { formatDate } from '@/lib/utils';

export default function HomePage() {
  const { data, isLoading } = useProjects();

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0">
        <Card>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Projects Filters
          </h2>
          <p className="text-sm text-gray-400">Not yet implemented</p>
        </Card>
      </aside>

      <div className="flex-1">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">Projects</h1>
          <Button>+ Create Project</Button>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          </div>
        ) : data?.items.length === 0 ? (
          <Card>
            <p className="text-center text-gray-500">No projects yet. Create one to get started.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data?.items.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`}>
                <Card className="cursor-pointer border border-transparent transition-colors hover:border-accent-gold">
                  <h3 className="text-lg font-semibold text-gray-800">{project.name}</h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Modified {formatDate(project.updatedAt)}
                  </p>
                  {project.description && (
                    <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                      {project.description}
                    </p>
                  )}
                  <div className="mt-3">
                    <StatusBadge status="new" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
