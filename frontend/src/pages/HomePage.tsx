// frontend/src/pages/HomePage.tsx
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Crown, FolderPlus, Search, X } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { CreateProjectModal } from '@/components/projects/CreateProjectModal';
import { ProjectFilters } from '@/components/projects/ProjectFilters';
import { useProjects, useReferenceProjects } from '@/hooks/useProjects';
import { formatBytes, formatDate } from '@/lib/utils';
import type { ProjectFilters as ProjectFiltersType } from '@/api/projects';

function useShowReferenceGuide() {
  const key = 'cleave_seen_reference_guide';
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(key) === '1');
  const dismiss = () => {
    localStorage.setItem(key, '1');
    setDismissed(true);
  };
  return { show: !dismissed, dismiss };
}

export default function HomePage() {
  const [filters, setFilters] = useState<ProjectFiltersType>({});
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  const activeFilters: ProjectFiltersType = {
    ...filters,
    ...(debouncedSearch && { search: debouncedSearch }),
  };

  const { data, isLoading } = useProjects(page, 25, activeFilters);
  const { data: referenceProjects } = useReferenceProjects();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const guide = useShowReferenceGuide();

  const hasReference = referenceProjects && referenceProjects.length > 0;

  function handleApplyFilters(newFilters: ProjectFiltersType) {
    setFilters(newFilters);
    setPage(1);
  }

  function handleClearFilters() {
    setFilters({});
    setPage(1);
  }

  return (
    <div className="flex gap-6">
      <aside className="w-64 shrink-0 space-y-4">
        {hasReference && (
          <Card className="border-l-4 border-l-amber-400 dark:border-l-amber-500">
            <h2 className="mb-3 flex items-center gap-1.5 font-display text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
              <Crown className="h-3.5 w-3.5" />
              Reference Data
            </h2>
            {referenceProjects.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`}>
                <div className="group -mx-2 rounded-lg p-2 transition-colors hover:bg-amber-50 dark:hover:bg-amber-950/30">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="text-sm font-semibold text-foreground group-hover:text-amber-700 dark:group-hover:text-amber-300">
                      {project.name}
                    </span>
                  </div>
                  <p className="mt-1 pl-6 text-xs text-muted-foreground">
                    Pre-analyzed CUT&RUN data with full pipeline outputs
                  </p>
                  <span className="mt-1.5 inline-block pl-6 text-xs font-medium text-amber-600 dark:text-amber-400">
                    Explore &rarr;
                  </span>
                </div>
              </Link>
            ))}
          </Card>
        )}

        <ProjectFilters onApply={handleApplyFilters} onClear={handleClearFilters} />
      </aside>

      <div className="flex-1">
        {guide.show && hasReference && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-center gap-3">
              <Crown className="h-5 w-5 shrink-0 text-amber-500" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                <span className="font-semibold">New to Cleave?</span>{' '}
                Explore the Gold Standard Reference Project in the sidebar to browse pre-analyzed CUT&RUN data.
              </p>
            </div>
            <button
              onClick={guide.dismiss}
              className="ml-4 shrink-0 rounded p-1 text-amber-500 hover:bg-amber-100 dark:hover:bg-amber-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="font-display text-xl font-bold text-foreground">Projects</h1>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Search projects..."
                value={searchText}
                onChange={(e) => {
                  setSearchText(e.target.value);
                  setPage(1);
                }}
                className="rounded-md border border-input bg-background py-1.5 pl-8 pr-3 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
            <Button onClick={() => setIsCreateModalOpen(true)}>+ Create Project</Button>
          </div>
        </div>

        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : data?.items.length === 0 ? (
          <EmptyState
            icon={FolderPlus}
            title="No projects found"
            description={
              Object.keys(activeFilters).length > 0
                ? 'Try adjusting your filters or search.'
                : 'Create one to get started.'
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data?.items.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`}>
                <Card variant="interactive" className="cursor-pointer">
                  <h3 className="text-lg font-semibold text-foreground">{project.name}</h3>
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    <span>Modified {formatDate(project.updatedAt)}</span>
                    <span className="font-mono">{formatBytes(project.storageBytes)}</span>
                    <StatusBadge status={project.status} />
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
