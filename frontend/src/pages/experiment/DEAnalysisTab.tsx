// frontend/src/pages/experiment/DEAnalysisTab.tsx
import { ArrowLeftRight } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
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
      <Card>
        <div className="flex h-40 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </Card>
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
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
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
      {job && activeSubTab === 'info' && <DEInfoPanel job={job} />}

      {job && activeSubTab === 'input' && <DEInputPanel job={job} />}

      {job && activeSubTab === 'results' && (
        job.status === 'complete' ? (
          <DEResultsPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              Results will be available when the DE analysis completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'plots' && (
        job.status === 'complete' ? (
          <DEPlotsPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              Plots will be available when the DE analysis completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <DEFilesPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              Files will be available when the DE analysis completes.
            </p>
          </Card>
        )
      )}
    </div>
  );
}
