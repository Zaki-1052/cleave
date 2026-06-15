// frontend/src/pages/experiment/RnaseqQCTab.tsx
import { BarChart3 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { Experiment } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Spinner } from '@/components/ui/Spinner';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs } from '@/hooks/useJobs';
import { QCOverviewPanel } from '@/components/rnaseq-qc/QCOverviewPanel';
import { QCPerSamplePanel } from '@/components/rnaseq-qc/QCPerSamplePanel';
import { QCFilesPanel } from '@/components/rnaseq-qc/QCFilesPanel';
import { AlignmentInfoPanel } from '@/components/alignment/AlignmentInfoPanel';

type QCSubTab = 'overview' | 'per-sample' | 'files';

const SUB_TABS: { key: QCSubTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'per-sample', label: 'Per-Sample' },
  { key: 'files', label: 'Files' },
];

export default function RnaseqQCTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<QCSubTab>('overview');

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const qcJobs = (jobsData?.items ?? []).filter((j) => j.jobType === 'rnaseq_qc');

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = qcJobs.length > 0 ? qcJobs[0] : null;
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

  if (qcJobs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={BarChart3}
          title="No QC Dashboard runs yet"
          description='Click "New Analysis" above to run RSeQC + MultiQC quality control.'
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
            QC Dashboard
          </span>
          <Select
            value={String(activeJobId ?? '')}
            onValueChange={(val) => navigate(`/experiments/${id}/rnaseq-qc/${val}`)}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {qcJobs.map((j) => (
                <SelectItem key={j.id} value={String(j.id)}>
                  {j.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {job && <StatusBadge status={job.status} />}
      </div>

      {/* Info section (methods text, notes, job actions) */}
      {job && <AlignmentInfoPanel job={job} />}

      {/* Sub-tab navigation */}
      {job && (
        <div className="flex border-b border-border">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
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
      {job && activeSubTab === 'overview' && (
        job.status === 'complete' ? (
          <QCOverviewPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              MultiQC report will be available when the QC job completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'per-sample' && (
        job.status === 'complete' ? (
          <QCPerSamplePanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-muted-foreground">
              RSeQC metrics will be available when the QC job completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'files' && <QCFilesPanel jobId={job.id} />}
    </div>
  );
}
