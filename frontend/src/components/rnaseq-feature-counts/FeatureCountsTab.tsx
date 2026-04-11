// frontend/src/components/rnaseq-feature-counts/FeatureCountsTab.tsx
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { ListOrdered } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import type { Experiment } from '@/api/types';
import { AlignmentFilesPanel } from '@/components/alignment/AlignmentFilesPanel';
import { AlignmentInfoPanel } from '@/components/alignment/AlignmentInfoPanel';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs } from '@/hooks/useJobs';
import { RNASEQ_FEATURE_COUNTS_FILE_CATEGORIES } from '@/lib/constants';

type SubTab = 'info' | 'files';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'files', label: 'Files' },
];

export default function FeatureCountsTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('info');

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const fcJobs = (jobsData?.items ?? []).filter((j) => j.jobType === 'rnaseq_feature_counts');

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = fcJobs.length > 0 ? fcJobs[0] : null;
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

  if (fcJobs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={ListOrdered}
          title="No featureCounts runs yet"
          description='Click "New Analysis" above to launch featureCounts gene counting.'
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
            featureCounts
          </span>
          <Select
            value={String(activeJobId ?? '')}
            onValueChange={(val) => navigate(`/experiments/${id}/feature-counts/${val}`)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fcJobs.map((j) => (
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
      {job && activeSubTab === 'info' && <AlignmentInfoPanel job={job} />}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <AlignmentFilesPanel jobId={job.id} categories={RNASEQ_FEATURE_COUNTS_FILE_CATEGORIES} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              Files will be available when featureCounts completes.
            </p>
          </Card>
        )
      )}
    </div>
  );
}
