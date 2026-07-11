// frontend/src/pages/experiment/DiffBindTab.tsx
import { ArrowLeftRight, FileText, LineChart, Table2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { Experiment } from '@/api/types';
import { DiffBindFilesPanel } from '@/components/diffbind/DiffBindFilesPanel';
import { DiffBindInfoPanel } from '@/components/diffbind/DiffBindInfoPanel';
import { DiffBindInputPanel } from '@/components/diffbind/DiffBindInputPanel';
import { DiffBindPlotsPanel } from '@/components/diffbind/DiffBindPlotsPanel';
import { DiffBindResultsPanel } from '@/components/diffbind/DiffBindResultsPanel';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs } from '@/hooks/useJobs';

type DiffBindSubTab = 'info' | 'input' | 'results' | 'plots' | 'files';

const SUB_TABS: { key: DiffBindSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'input', label: 'Input' },
  { key: 'results', label: 'Results' },
  { key: 'plots', label: 'Plots' },
  { key: 'files', label: 'Files' },
];

export default function DiffBindTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<DiffBindSubTab>('info');

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const diffBindJobs = (jobsData?.items ?? []).filter((j) => j.jobType === 'diffbind');

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = diffBindJobs.length > 0 ? diffBindJobs[0] : null;
  const activeJobId = requestedId ?? latestJob?.id ?? null;

  const { data: job, isLoading: jobLoading } = useJob(activeJobId);

  const isLoading = jobsLoading || jobLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-[220px] rounded-md" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex gap-2 border-b border-border pb-px">
          {Array.from({ length: SUB_TABS.length }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16" />
          ))}
        </div>
        <Card>
          <Skeleton className="h-40 w-full" />
        </Card>
      </div>
    );
  }

  if (diffBindJobs.length === 0) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title="No DiffBind runs yet"
        description='Click "New Analysis" above to create a DiffBind differential analysis.'
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Job selector + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            DiffBind
          </span>
          <Select value={String(activeJobId ?? '')} onValueChange={(val) => navigate(`/experiments/${id}/diffbind/${val}`)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {diffBindJobs.map((j) => (
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
              className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors duration-150 ${
                activeSubTab === tab.key
                  ? 'border-b-2 border-primary bg-primary/5 text-primary'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Sub-tab content */}
      {job && activeSubTab === 'info' && <DiffBindInfoPanel job={job} />}

      {job && activeSubTab === 'input' && <DiffBindInputPanel job={job} />}

      {job && activeSubTab === 'results' && (
        job.status === 'complete' ? (
          <DiffBindResultsPanel jobId={job.id} />
        ) : (
          <EmptyState
            icon={Table2}
            title="Results not available yet"
            description="Results will be available when the DiffBind analysis completes."
          />
        )
      )}

      {job && activeSubTab === 'plots' && (
        job.status === 'complete' ? (
          <DiffBindPlotsPanel jobId={job.id} />
        ) : (
          <EmptyState
            icon={LineChart}
            title="Plots not available yet"
            description="Plots will be available when the DiffBind analysis completes."
          />
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <DiffBindFilesPanel jobId={job.id} />
        ) : (
          <EmptyState
            icon={FileText}
            title="Files not available yet"
            description="Files will be available when the DiffBind analysis completes."
          />
        )
      )}
    </div>
  );
}
