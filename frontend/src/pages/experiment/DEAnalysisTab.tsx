// frontend/src/pages/experiment/DEAnalysisTab.tsx
import { ArrowLeftRight, FolderOpen, LineChart, Table2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { Experiment } from '@/api/types';
import { DEFilesPanel } from '@/components/rnaseq-de/DEFilesPanel';
import { DEInfoPanel } from '@/components/rnaseq-de/DEInfoPanel';
import { DEInputPanel } from '@/components/rnaseq-de/DEInputPanel';
import { DEPlotsPanel } from '@/components/rnaseq-de/DEPlotsPanel';
import { DEResultsPanel } from '@/components/rnaseq-de/DEResultsPanel';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs } from '@/hooks/useJobs';

type DESubTab = 'info' | 'input' | 'results' | 'plots' | 'files';

const SUB_TABS: { key: DESubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'input', label: 'Input' },
  { key: 'results', label: 'Results' },
  { key: 'plots', label: 'Plots' },
  { key: 'files', label: 'Files' },
];

export default function DEAnalysisTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<DESubTab>('info');

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const deJobs = (jobsData?.items ?? []).filter((j) => j.jobType === 'rnaseq_de');

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = deJobs.length > 0 ? deJobs[0] : null;
  const activeJobId = requestedId ?? latestJob?.id ?? null;

  const { data: job, isLoading: jobLoading } = useJob(activeJobId);

  const isLoading = jobsLoading || jobLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-9 w-[220px]" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex gap-2 border-b border-border pb-px">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16" />
          ))}
        </div>
        <Card>
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-1.5 h-4 w-4/5" />
        </Card>
      </div>
    );
  }

  if (deJobs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ArrowLeftRight}
          title="No DE analysis runs yet"
          description='Click "New Analysis" above to create a DESeq2 differential expression analysis.'
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Job selector + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            DE Analysis
          </span>
          <Select value={String(activeJobId ?? '')} onValueChange={(val) => navigate(`/experiments/${id}/de/${val}`)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {deJobs.map((j) => (
                <SelectItem key={j.id} value={String(j.id)}>{j.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {job && <StatusBadge status={job.status} />}
      </div>

      {/* Sub-tab navigation */}
      {job && (
        <div className="flex border-b border-border">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSubTab(tab.key)}
              className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeSubTab === tab.key
                  ? 'border-b-2 border-primary bg-primary/5 text-primary'
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Sub-tab content */}
      {job && activeSubTab === 'info' && <DEInfoPanel job={job} />}

      {job && activeSubTab === 'input' && <DEInputPanel job={job} />}

      {job && activeSubTab === 'results' && (
        job.status === 'complete' ? (
          <DEResultsPanel jobId={job.id} organism={(job.params as Record<string, unknown>)?.reference_genome as string ?? null} />
        ) : (
          <Card>
            <EmptyState
              icon={Table2}
              title="Results not ready"
              description="Results will be available when the DE analysis completes."
            />
          </Card>
        )
      )}

      {job && activeSubTab === 'plots' && (
        job.status === 'complete' ? (
          <DEPlotsPanel jobId={job.id} />
        ) : (
          <Card>
            <EmptyState
              icon={LineChart}
              title="Plots not ready"
              description="Plots will be available when the DE analysis completes."
            />
          </Card>
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <DEFilesPanel jobId={job.id} />
        ) : (
          <Card>
            <EmptyState
              icon={FolderOpen}
              title="Files not ready"
              description="Files will be available when the DE analysis completes."
            />
          </Card>
        )
      )}
    </div>
  );
}
