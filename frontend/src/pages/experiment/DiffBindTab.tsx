// frontend/src/pages/experiment/DiffBindTab.tsx
import { Spinner } from '@/components/ui/Spinner';
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { Experiment } from '@/api/types';
import { DiffBindFilesPanel } from '@/components/diffbind/DiffBindFilesPanel';
import { DiffBindInfoPanel } from '@/components/diffbind/DiffBindInfoPanel';
import { DiffBindInputPanel } from '@/components/diffbind/DiffBindInputPanel';
import { DiffBindPlotsPanel } from '@/components/diffbind/DiffBindPlotsPanel';
import { DiffBindResultsPanel } from '@/components/diffbind/DiffBindResultsPanel';
import { Card } from '@/components/layout/Card';
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
      <Card>
        <div className="flex h-40 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }

  if (diffBindJobs.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="text-sm font-medium text-muted-foreground">No DiffBind runs yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Click &ldquo;New Analysis&rdquo; above to create a DiffBind differential analysis.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Job selector + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
              className={`px-4 py-2 text-sm font-medium transition-all duration-150 ${
                activeSubTab === tab.key
                  ? 'border-b-2 border-primary text-primary bg-primary/5 rounded-t-md'
                  : 'text-muted-foreground hover:text-foreground rounded-t-md hover:bg-muted/50'
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
          <Card>
            <p className="text-sm text-muted-foreground">
              Results will be available when the DiffBind analysis completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'plots' && (
        job.status === 'complete' ? (
          <DiffBindPlotsPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              Plots will be available when the DiffBind analysis completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <DiffBindFilesPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              Files will be available when the DiffBind analysis completes.
            </p>
          </Card>
        )
      )}
    </div>
  );
}
