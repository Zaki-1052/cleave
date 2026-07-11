// frontend/src/components/rnaseq-alignment/RnaseqAlignmentTab.tsx
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { BarChart3, Dna, FileText, LineChart } from 'lucide-react';
import type { Experiment } from '@/api/types';
import { AlignmentFilesPanel } from '@/components/alignment/AlignmentFilesPanel';
import { AlignmentInfoPanel } from '@/components/alignment/AlignmentInfoPanel';
import { RnaseqAlignmentInputPanel } from './RnaseqAlignmentInputPanel';
import { RnaseqAlignmentQCReportPanel } from './RnaseqAlignmentQCReportPanel';
import { IGVPanel } from '@/components/igv/IGVPanel';
import { Card } from '@/components/layout/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs } from '@/hooks/useJobs';
import { RNASEQ_ALIGNMENT_FILE_CATEGORIES } from '@/lib/constants';

type SubTab = 'info' | 'input' | 'qc-report' | 'files' | 'igv';

const SUB_TABS: { key: SubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'input', label: 'Input' },
  { key: 'qc-report', label: 'QC Report' },
  { key: 'files', label: 'Files' },
  { key: 'igv', label: 'IGV' },
];

export default function RnaseqAlignmentTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('info');

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const alignmentJobs = (jobsData?.items ?? []).filter((j) => j.jobType === 'rnaseq_alignment');

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = alignmentJobs.length > 0 ? alignmentJobs[0] : null;
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

  if (alignmentJobs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Dna}
          title="No RNA-seq alignment runs yet"
          description='Click "New Analysis" above to launch a STAR + Salmon alignment.'
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
          <RnaseqAlignmentQCReportPanel jobId={job.id} />
        ) : (
          <Card>
            <EmptyState
              icon={BarChart3}
              title="QC report not ready"
              description="The QC report will be available when the alignment completes."
            />
          </Card>
        )
      )}

      {job && activeSubTab === 'input' && (
        <RnaseqAlignmentInputPanel job={job} experimentId={experiment.id} />
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <AlignmentFilesPanel jobId={job.id} categories={RNASEQ_ALIGNMENT_FILE_CATEGORIES} />
        ) : (
          <Card>
            <EmptyState
              icon={FileText}
              title="Files not ready"
              description="Files will be available when the alignment completes."
            />
          </Card>
        )
      )}

      {job && activeSubTab === 'igv' && (
        job.status === 'complete' ? (
          <IGVPanel job={job} experimentId={experiment.id} mode="alignment" />
        ) : (
          <Card>
            <EmptyState
              icon={LineChart}
              title="IGV not ready"
              description="The IGV browser will be available when the alignment completes."
            />
          </Card>
        )
      )}
    </div>
  );
}
