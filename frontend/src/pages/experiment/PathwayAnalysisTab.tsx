// frontend/src/pages/experiment/PathwayAnalysisTab.tsx
import { Share2 } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { Experiment } from '@/api/types';
import { AlignmentInfoPanel } from '@/components/alignment/AlignmentInfoPanel';
import { PathwayGOPanel } from '@/components/rnaseq-pathway/PathwayGOPanel';
import { PathwayKEGGPanel } from '@/components/rnaseq-pathway/PathwayKEGGPanel';
import { PathwayFilesPanel } from '@/components/rnaseq-pathway/PathwayFilesPanel';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs } from '@/hooks/useJobs';

type PathwaySubTab = 'info' | 'go' | 'kegg' | 'files';

const SUB_TABS: { key: PathwaySubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'go', label: 'GO Enrichment' },
  { key: 'kegg', label: 'KEGG Pathways' },
  { key: 'files', label: 'Files' },
];

export default function PathwayAnalysisTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<PathwaySubTab>('info');

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const pathwayJobs = (jobsData?.items ?? []).filter((j) => j.jobType === 'rnaseq_pathway');

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = pathwayJobs.length > 0 ? pathwayJobs[0] : null;
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

  if (pathwayJobs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Share2}
          title="No pathway analysis runs yet"
          description='Click "New Analysis" above to run GO enrichment + KEGG pathway analysis.'
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-display text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pathway Analysis
          </span>
          <Select value={String(activeJobId ?? '')} onValueChange={(val) => navigate(`/experiments/${id}/pathway/${val}`)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pathwayJobs.map((j) => (
                <SelectItem key={j.id} value={String(j.id)}>{j.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {job && <StatusBadge status={job.status} />}
      </div>

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

      {job && activeSubTab === 'info' && <AlignmentInfoPanel job={job} />}

      {job && activeSubTab === 'go' && (
        job.status === 'complete' ? (
          <PathwayGOPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              GO enrichment results will be available when the analysis completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'kegg' && (
        job.status === 'complete' ? (
          <PathwayKEGGPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              KEGG pathway results will be available when the analysis completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <PathwayFilesPanel jobId={job.id} experimentId={experiment.id} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              Files will be available when the analysis completes.
            </p>
          </Card>
        )
      )}
    </div>
  );
}
