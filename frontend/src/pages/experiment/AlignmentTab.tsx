// frontend/src/pages/experiment/AlignmentTab.tsx
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { BarChart3, Dna, FileText, LineChart } from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import type { Experiment } from '@/api/types';
import RnaseqAlignmentTab from '@/components/rnaseq-alignment/RnaseqAlignmentTab';
import { AlignmentFilesPanel } from '@/components/alignment/AlignmentFilesPanel';
import { AlignmentInfoPanel } from '@/components/alignment/AlignmentInfoPanel';
import { AlignmentInputPanel } from '@/components/alignment/AlignmentInputPanel';
import { AlignmentQCReportPanel } from '@/components/alignment/AlignmentQCReportPanel';
import { IGVPanel } from '@/components/igv/IGVPanel';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs } from '@/hooks/useJobs';

type AlignmentSubTab = 'info' | 'input' | 'qc-report' | 'files' | 'igv';

const SUB_TABS: { key: AlignmentSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'input', label: 'Input' },
  { key: 'qc-report', label: 'QC Report' },
  { key: 'files', label: 'Files' },
  { key: 'igv', label: 'IGV' },
];

export default function AlignmentTab() {
  const { experiment } = useOutletContext<{ experiment: Experiment }>();

  if (experiment.assayType === 'RNA-seq') {
    return <RnaseqAlignmentTab />;
  }

  return <CutandrunAlignmentTab />;
}

function CutandrunAlignmentTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<AlignmentSubTab>('info');

  // Fetch all jobs for this experiment, filter to alignment client-side
  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const alignmentJobs = (jobsData?.items ?? []).filter((j) => j.jobType === 'alignment');

  // Determine which job to display
  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = alignmentJobs.length > 0 ? alignmentJobs[0] : null;
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

  if (alignmentJobs.length === 0) {
    return (
      <EmptyState
        icon={Dna}
        title="No alignment runs yet"
        description='Click "New Analysis" above to create an alignment run.'
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Job selector + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Alignments
          </span>
          <Select value={String(activeJobId ?? '')} onValueChange={(val) => navigate(`/experiments/${id}/alignment/${val}`)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {alignmentJobs.map((j) => (
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
              className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
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
      {job && activeSubTab === 'info' && <AlignmentInfoPanel job={job} />}

      {job && activeSubTab === 'qc-report' && (
        job.status === 'complete' ? (
          <AlignmentQCReportPanel jobId={job.id} job={job} />
        ) : (
          <EmptyState
            icon={BarChart3}
            title="QC report not ready"
            description="The QC report will be available when the alignment completes."
          />
        )
      )}

      {job && activeSubTab === 'input' && (
        <AlignmentInputPanel job={job} experimentId={experiment.id} />
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <AlignmentFilesPanel jobId={job.id} />
        ) : (
          <EmptyState
            icon={FileText}
            title="Files not ready"
            description="Files will be available when the alignment completes."
          />
        )
      )}

      {job && activeSubTab === 'igv' && (
        job.status === 'complete' ? (
          <IGVPanel job={job} experimentId={experiment.id} mode="alignment" />
        ) : (
          <EmptyState
            icon={LineChart}
            title="IGV not ready"
            description="The IGV browser will be available when the alignment completes."
          />
        )
      )}
    </div>
  );
}
