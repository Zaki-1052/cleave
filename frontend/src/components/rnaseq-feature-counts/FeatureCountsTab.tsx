// frontend/src/components/rnaseq-feature-counts/FeatureCountsTab.tsx
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { FolderOpen, ListOrdered } from 'lucide-react';
import type { Experiment } from '@/api/types';
import { AlignmentFilesPanel } from '@/components/alignment/AlignmentFilesPanel';
import { AlignmentInfoPanel } from '@/components/alignment/AlignmentInfoPanel';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
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
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-[220px] rounded-md" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-9 w-full" />
        <Card>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-4/5" />
        </Card>
      </div>
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
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
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
              className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                activeSubTab === tab.key
                  ? 'border-b-2 border-primary bg-primary/5 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
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
            <EmptyState
              icon={FolderOpen}
              title="Files not ready"
              description="Output files will be available when featureCounts completes."
            />
          </Card>
        )
      )}
    </div>
  );
}
