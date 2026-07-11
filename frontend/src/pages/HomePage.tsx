// frontend/src/pages/HomePage.tsx — project dashboard. Fieldbook exemplar page:
// PageHeader specimen label, skeleton-grid loading, shared Pagination, ember reserved
// for the reference-data signal.
import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Crown, FolderPlus, Search, X } from 'lucide-react';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { Pagination } from '@/components/ui/Pagination';
import { PageHeader } from '@/components/ui/PageHeader';
import { CreateProjectModal } from '@/components/projects/CreateProjectModal';
import { ProjectFilters } from '@/components/projects/ProjectFilters';
import { useProjects, useReferenceProjects } from '@/hooks/useProjects';
import { formatBytes, formatDate } from '@/lib/utils';
import type { ProjectFilters as ProjectFiltersType } from '@/api/projects';

const PER_PAGE = 25;

function filtersFromParams(params: URLSearchParams): ProjectFiltersType {
  const filters: ProjectFiltersType = {};
  const statuses = params.get('statuses');
  if (statuses) filters.statuses = statuses.split(',');
  const members = params.get('members');
  if (members) filters.memberIds = members.split(',').map(Number);
  if (params.get('after')) filters.createdAfter = params.get('after')!;
  if (params.get('before')) filters.createdBefore = params.get('before')!;
  return filters;
}

function filtersToParams(
  filters: ProjectFiltersType,
  page: number,
  search: string,
): Record<string, string> {
  const params: Record<string, string> = {};
  if (page > 1) params.page = String(page);
  if (search) params.search = search;
  if (filters.statuses?.length) params.statuses = filters.statuses.join(',');
  if (filters.memberIds?.length) params.members = filters.memberIds.join(',');
  if (filters.createdAfter) params.after = filters.createdAfter;
  if (filters.createdBefore) params.before = filters.createdBefore;
  return params;
}

function useShowReferenceGuide() {
  const key = 'cleave_seen_reference_guide';
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(key) === '1');
  const dismiss = () => {
    localStorage.setItem(key, '1');
    setDismissed(true);
  };
  return { show: !dismissed, dismiss };
}

function ProjectCardSkeleton() {
  return (
    <Card>
      <Skeleton className="h-5 w-2/3" />
      <div className="mt-3 flex items-center gap-3">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-3.5 w-16" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-1.5 h-4 w-4/5" />
    </Card>
  );
}

export default function HomePage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState<ProjectFiltersType>(() =>
    filtersFromParams(searchParams),
  );
  const [page, setPage] = useState(() => Number(searchParams.get('page')) || 1);
  const [searchText, setSearchText] = useState(() => searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => searchParams.get('search') || '');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchText), 300);
    return () => clearTimeout(timer);
  }, [searchText]);

  // Sync state back to URL
  useEffect(() => {
    setSearchParams(filtersToParams(filters, page, debouncedSearch), { replace: true });
  }, [filters, page, debouncedSearch, setSearchParams]);

  const activeFilters: ProjectFiltersType = {
    ...filters,
    ...(debouncedSearch && { search: debouncedSearch }),
  };

  const { data, isLoading } = useProjects(page, PER_PAGE, activeFilters);
  const { data: referenceProjects } = useReferenceProjects();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const guide = useShowReferenceGuide();

  const hasReference = referenceProjects && referenceProjects.length > 0;
  const total = data?.total ?? 0;

  function handleApplyFilters(newFilters: ProjectFiltersType) {
    setFilters(newFilters);
    setPage(1);
  }

  function handleClearFilters() {
    setFilters({});
    setPage(1);
  }

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <aside className="w-full shrink-0 space-y-4 lg:w-64">
        {hasReference && (
          <Card className="border-l-2 border-l-ember">
            <h2 className="mb-3 flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-warning">
              <Crown className="h-3.5 w-3.5 text-ember" />
              Reference Data
            </h2>
            {referenceProjects.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`}>
                <div className="group -mx-2 rounded-md p-2 transition-colors duration-150 hover:bg-accent/60">
                  <div className="flex items-center gap-2">
                    <Crown className="h-4 w-4 shrink-0 text-ember" />
                    <span className="text-sm font-semibold text-foreground">
                      {project.name}
                    </span>
                  </div>
                  <p className="mt-1 pl-6 text-xs text-muted-foreground">
                    Pre-analyzed CUT&RUN data with full pipeline outputs
                  </p>
                  <span className="mt-1.5 inline-block pl-6 text-xs font-medium text-warning">
                    Explore &rarr;
                  </span>
                </div>
              </Link>
            ))}
          </Card>
        )}

        <ProjectFilters
          initialFilters={filters}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
        />
      </aside>

      <div className="min-w-0 flex-1">
        {guide.show && hasReference && (
          <div className="mb-5 flex items-center justify-between rounded-md border border-ember/30 bg-ember/10 px-4 py-3">
            <div className="flex items-center gap-3">
              <Crown className="h-5 w-5 shrink-0 text-ember" />
              <p className="text-sm text-foreground/85">
                <span className="font-semibold">New to Cleave?</span>{' '}
                Explore the Gold Standard Reference Project in the sidebar to browse pre-analyzed
                CUT&RUN data.
              </p>
            </div>
            <button
              onClick={guide.dismiss}
              aria-label="Dismiss"
              className="ml-4 shrink-0 rounded-md p-1 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <PageHeader
          title="Projects"
          eyebrow="Workspace"
          actions={
            <>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search projects…"
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setPage(1);
                  }}
                  className="rounded-md border border-input bg-card py-1.5 pl-8 pr-3 text-sm text-foreground outline-none transition-colors duration-150 placeholder:text-muted-foreground/60 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
                />
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              </div>
              <Button onClick={() => setIsCreateModalOpen(true)}>+ Create Project</Button>
            </>
          }
        />

        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
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
            action={
              Object.keys(activeFilters).length === 0 ? (
                <Button onClick={() => setIsCreateModalOpen(true)}>+ Create Project</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data?.items.map((project) => (
              <Link key={project.id} to={`/projects/${project.id}`}>
                <Card variant="interactive" className="h-full cursor-pointer">
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    {project.name}
                  </h3>
                  <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Modified {formatDate(project.updatedAt)}</span>
                    <span className="font-mono tabular-nums">{formatBytes(project.storageBytes)}</span>
                    <StatusBadge status={project.status} />
                  </div>
                  {project.description && (
                    <p className="mt-2.5 line-clamp-2 text-sm text-muted-foreground">
                      {project.description}
                    </p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}

        {total > 0 && !isLoading && (
          <Pagination
            className="mt-4 rounded-lg border border-border bg-card px-4"
            page={page}
            pageSize={PER_PAGE}
            totalItems={total}
            onPageChange={setPage}
          />
        )}

        <CreateProjectModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
        />
      </div>
    </div>
  );
}
