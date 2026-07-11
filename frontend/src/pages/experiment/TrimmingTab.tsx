// frontend/src/pages/experiment/TrimmingTab.tsx
import { Scissors, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { AnalysisJob, Experiment } from '@/api/types';
import { FastpReportsPanel } from '@/components/trimming/FastpReportsPanel';
import { TrimmingFilesPanel } from '@/components/trimming/TrimmingFilesPanel';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/layout/Card';
import { DetailRow } from '@/components/ui/DetailRow';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import JobActions from '@/components/ui/JobActions';
import JobErrorDetails from '@/components/ui/JobErrorDetails';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs, useUpdateJobNotes } from '@/hooks/useJobs';
import { RNASEQ_TRIMMING_FILE_CATEGORIES } from '@/lib/constants';
import { formatDate, getDisplayName } from '@/lib/utils';

type TrimmingSubTab = 'info' | 'reports' | 'files';

const CUTANDRUN_SUB_TABS: { key: TrimmingSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'files', label: 'Files' },
];

const RNASEQ_SUB_TABS: { key: TrimmingSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'reports', label: 'Reports' },
  { key: 'files', label: 'Files' },
];

function TrimmingTabSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-[220px]" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <Skeleton className="h-3.5 w-24" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, r) => (
                <Skeleton key={r} className="h-4 w-full" />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

export default function TrimmingTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const isRnaseq = experiment.assayType === 'RNA-seq';
  const subTabs = isRnaseq ? RNASEQ_SUB_TABS : CUTANDRUN_SUB_TABS;
  const [activeSubTab, setActiveSubTab] = useState<TrimmingSubTab>('info');

  const trimmingJobType = isRnaseq ? 'rnaseq_trimming' : 'trimming';
  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const trimmingJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) => j.jobType === trimmingJobType,
  );

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = trimmingJobs.length > 0 ? trimmingJobs[0] : null;
  const activeJobId = requestedId ?? latestJob?.id ?? null;

  const { data: job, isLoading: jobLoading } = useJob(activeJobId);

  const isLoading = jobsLoading || jobLoading;

  if (isLoading) {
    return <TrimmingTabSkeleton />;
  }

  if (trimmingJobs.length === 0) {
    return (
      <EmptyState
        icon={Scissors}
        title="No trimming runs yet"
        description={isRnaseq
          ? 'Navigate to the FASTQs tab to run fastp trimming.'
          : 'Navigate to the FASTQs tab to run trimming.'}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Job selector + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Trimming Runs
          </span>
          <Select value={String(activeJobId ?? '')} onValueChange={(val) => navigate(`/experiments/${id}/trimming/${val}`)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {trimmingJobs.map((j: AnalysisJob) => (
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
          {subTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSubTab(tab.key)}
              className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
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
      {job && activeSubTab === 'info' && <TrimmingInfoPanel job={job} isRnaseq={isRnaseq} />}

      {job && activeSubTab === 'reports' && (
        job.status === 'complete' ? (
          <FastpReportsPanel jobId={job.id} />
        ) : (
          <EmptyState
            icon={Clock}
            title="Reports not ready"
            description="Reports will be available when the trimming run completes."
          />
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <TrimmingFilesPanel
            jobId={job.id}
            categories={isRnaseq ? RNASEQ_TRIMMING_FILE_CATEGORIES : undefined}
          />
        ) : (
          <EmptyState
            icon={Clock}
            title="Files not ready"
            description="Files will be available when the trimming run completes."
          />
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Info Panel
// ---------------------------------------------------------------------------

function TrimmingInfoPanel({ job, isRnaseq }: { job: AnalysisJob; isRnaseq: boolean }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(job.notes ?? '');
  const updateNotes = useUpdateJobNotes();

  const launcherName = job.launcher ? getDisplayName(job.launcher) : 'Unknown';
  const params = job.params ?? {};
  const pairCount = ((params.fastq_pairs as unknown[]) ?? []).length;
  const adapterFile = (params.adapter_file as string) ?? 'Unknown';

  async function handleCopyMethods() {
    if (!job.methodsText) return;
    await navigator.clipboard.writeText(job.methodsText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleEditStart() {
    setDraft(job.notes ?? '');
    setEditing(true);
  }

  function handleSave() {
    updateNotes.mutate(
      { jobId: job.id, notes: draft || null },
      {
        onSuccess: () => {
          setEditing(false);
          toast.success('Notes saved');
        },
        onError: () => toast.error('Failed to save notes'),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {/* Details */}
        <Card>
          <h4 className="mb-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Details</h4>
          <div className="space-y-2">
            <DetailRow label="Run ID"><span className="font-mono">{String(job.id)}</span></DetailRow>
            <DetailRow label="Created By">{launcherName}</DetailRow>
            <DetailRow label="Created Date">{formatDate(job.createdAt)}</DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={job.status} />
            </DetailRow>
            <DetailRow label="Pairs Trimmed"><span className="font-mono">{String(pairCount)}</span></DetailRow>
            {!isRnaseq && (
              <DetailRow label="Adapter File">{adapterFile}</DetailRow>
            )}
            {isRnaseq && params.qualified_quality_phred != null && (
              <DetailRow label="Quality Phred"><span className="font-mono">{String(params.qualified_quality_phred as number)}</span></DetailRow>
            )}
            {isRnaseq && params.length_required != null && (
              <DetailRow label="Min Length"><span className="font-mono">{String(params.length_required as number)}</span></DetailRow>
            )}
          </div>
        </Card>

        {/* Methods Text */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Run Methods</h4>
            {job.methodsText && (
              <button
                onClick={handleCopyMethods}
                className="rounded-sm text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            )}
          </div>
          {job.methodsText ? (
            <p className="text-sm leading-relaxed text-foreground">{job.methodsText}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No methods text available.</p>
          )}
        </Card>

        {/* Notes */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Notes</h4>
            {!editing && (
              <button
                onClick={handleEditStart}
                className="rounded-sm text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Manage
              </button>
            )}
          </div>
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={4}
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/25"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} loading={updateNotes.isPending}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              {job.notes || <span className="text-muted-foreground">No notes.</span>}
            </p>
          )}
        </Card>
      </div>

      <JobActions job={job} />
      <JobErrorDetails job={job} />
    </div>
  );
}
