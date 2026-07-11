// frontend/src/pages/experiment/PeakCallingTab.tsx
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Clock, Mountain } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import type { Experiment } from '@/api/types';
import { PeakCallingFilesPanel } from '@/components/peak-calling/PeakCallingFilesPanel';
import { PeakCallingInfoPanel } from '@/components/peak-calling/PeakCallingInfoPanel';
import { PeakCallingInputPanel } from '@/components/peak-calling/PeakCallingInputPanel';
import { PeakCallingQCReportPanel } from '@/components/peak-calling/PeakCallingQCReportPanel';
import { IGVPanel } from '@/components/igv/IGVPanel';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs } from '@/hooks/useJobs';

type PeakCallingSubTab = 'info' | 'input' | 'qc-report' | 'files' | 'igv';

const SUB_TABS: { key: PeakCallingSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'input', label: 'Input' },
  { key: 'qc-report', label: 'QC Report' },
  { key: 'files', label: 'Files' },
  { key: 'igv', label: 'IGV' },
];

export default function PeakCallingTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<PeakCallingSubTab>('info');

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const peakCallingJobs = (jobsData?.items ?? []).filter((j) => j.jobType === 'peak_calling');

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = peakCallingJobs.length > 0 ? peakCallingJobs[0] : null;
  const activeJobId = requestedId ?? latestJob?.id ?? null;

  const { data: job, isLoading: jobLoading } = useJob(activeJobId);

  const isLoading = jobsLoading || jobLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-9 w-[220px] rounded-md" />
          </div>
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <div className="flex gap-2 border-b border-border pb-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-20 rounded-t-md" />
          ))}
        </div>
        <Card>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-3 h-4 w-full" />
          <Skeleton className="mt-1.5 h-4 w-5/6" />
          <Skeleton className="mt-1.5 h-4 w-2/3" />
        </Card>
      </div>
    );
  }

  if (peakCallingJobs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Mountain}
          title="No peak calling runs yet"
          description='Click "New Analysis" above to create a peak calling run.'
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
            Peak Calling
          </span>
          <Select value={String(activeJobId ?? '')} onValueChange={(val) => navigate(`/experiments/${id}/peaks/${val}`)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {peakCallingJobs.map((j) => (
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
              className={`px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset ${
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
      {job && activeSubTab === 'info' && <PeakCallingInfoPanel job={job} />}

      {job && activeSubTab === 'input' && <PeakCallingInputPanel job={job} />}

      {job && activeSubTab === 'qc-report' && (
        job.status === 'complete' ? (
          <PeakCallingQCReportPanel jobId={job.id} job={job} />
        ) : (
          <Card>
            <EmptyState
              icon={Clock}
              title="QC report not ready yet"
              description="The QC report will be available when the peak calling completes."
            />
          </Card>
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <PeakCallingFilesPanel jobId={job.id} />
        ) : (
          <Card>
            <EmptyState
              icon={Clock}
              title="Files not ready yet"
              description="Output files will be available when the peak calling completes."
            />
          </Card>
        )
      )}

      {job && activeSubTab === 'igv' && (
        job.status === 'complete' ? (
          <IGVPanel job={job} experimentId={experiment.id} mode="peak_calling" />
        ) : (
          <Card>
            <EmptyState
              icon={Clock}
              title="IGV not ready yet"
              description="The IGV browser will be available when the peak calling completes."
            />
          </Card>
        )
      )}
    </div>
  );
}
