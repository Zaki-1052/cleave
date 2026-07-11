// frontend/src/pages/experiment/NormalizationTab.tsx
import { Scale, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { AnalysisJob, Experiment } from '@/api/types';
import { NormalizationFilesPanel } from '@/components/normalization/NormalizationFilesPanel';
import { NormalizationResultsPanel } from '@/components/normalization/NormalizationResultsPanel';
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
import { formatDate, getDisplayName } from '@/lib/utils';

type NormalizationSubTab = 'info' | 'results' | 'files';

const SUB_TABS: { key: NormalizationSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'results', label: 'Results' },
  { key: 'files', label: 'Files' },
];

function NormalizationTabSkeleton() {
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

export default function NormalizationTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<NormalizationSubTab>('info');

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const normalizationJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) => j.jobType === 'roman_normalization',
  );

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = normalizationJobs.length > 0 ? normalizationJobs[0] : null;
  const activeJobId = requestedId ?? latestJob?.id ?? null;

  const { data: job, isLoading: jobLoading } = useJob(activeJobId);

  const isLoading = jobsLoading || jobLoading;

  if (isLoading) {
    return <NormalizationTabSkeleton />;
  }

  if (normalizationJobs.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title="No normalization runs yet"
        description='Click "New Analysis" above to create a Roman normalization.'
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Job selector + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Normalizations
          </span>
          <Select value={String(activeJobId ?? '')} onValueChange={(val) => navigate(`/experiments/${id}/normalization/${val}`)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {normalizationJobs.map((j: AnalysisJob) => (
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
                  : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Sub-tab content */}
      {job && activeSubTab === 'info' && <NormalizationInfoPanel job={job} />}

      {job && activeSubTab === 'results' && (
        job.status === 'complete' ? (
          <NormalizationResultsPanel jobId={job.id} />
        ) : (
          <EmptyState
            icon={Clock}
            title="Results not ready"
            description="Normalization results will be available when the analysis completes."
          />
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <NormalizationFilesPanel jobId={job.id} />
        ) : (
          <EmptyState
            icon={Clock}
            title="Files not ready"
            description="Files will be available when the analysis completes."
          />
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Info Panel
// ---------------------------------------------------------------------------

function NormalizationInfoPanel({ job }: { job: AnalysisJob }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(job.notes ?? '');
  const updateNotes = useUpdateJobNotes();

  const launcherName = job.launcher ? getDisplayName(job.launcher) : 'Unknown';
  const params = job.params ?? {};
  const sampleCount = ((params.samples as unknown[]) ?? []).length;
  const samples = (params.samples as Array<{ label?: string }>) ?? [];
  const referenceSampleLabel = samples.length > 0 ? (samples[0]?.label ?? 'Unknown') : 'Unknown';

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
            <DetailRow label="Samples"><span className="font-mono">{String(sampleCount)}</span></DetailRow>
            <DetailRow label="Reference Sample">{referenceSampleLabel}</DetailRow>
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
