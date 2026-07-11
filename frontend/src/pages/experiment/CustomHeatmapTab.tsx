// frontend/src/pages/experiment/CustomHeatmapTab.tsx
import { Grid3x3, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/Skeleton';
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { AnalysisJob, Experiment } from '@/api/types';
import { CustomHeatmapFilesPanel } from '@/components/custom-heatmap/CustomHeatmapFilesPanel';
import { CustomHeatmapPlotsPanel } from '@/components/custom-heatmap/CustomHeatmapPlotsPanel';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { DetailRow } from '@/components/ui/DetailRow';
import { EmptyState } from '@/components/ui/EmptyState';
import JobActions from '@/components/ui/JobActions';
import JobErrorDetails from '@/components/ui/JobErrorDetails';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs, useUpdateJobNotes } from '@/hooks/useJobs';
import { formatDate, getDisplayName } from '@/lib/utils';

type HeatmapSubTab = 'info' | 'plot' | 'files';

const SUB_TABS: { key: HeatmapSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'plot', label: 'Plot' },
  { key: 'files', label: 'Files' },
];

export default function CustomHeatmapTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<HeatmapSubTab>('info');

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const heatmapJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) => j.jobType === 'custom_heatmap',
  );

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = heatmapJobs.length > 0 ? heatmapJobs[0] : null;
  const activeJobId = requestedId ?? latestJob?.id ?? null;

  const { data: job, isLoading: jobLoading } = useJob(activeJobId);

  const isLoading = jobsLoading || jobLoading;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-9 w-[220px]" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <div className="flex gap-2 border-b border-border pb-2">
          <Skeleton className="h-7 w-14" />
          <Skeleton className="h-7 w-14" />
          <Skeleton className="h-7 w-14" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <Skeleton className="mb-3 h-3 w-24" />
              <div className="space-y-2.5">
                {Array.from({ length: 5 }).map((_, j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (heatmapJobs.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Grid3x3}
          title="No custom heatmap runs yet"
          description='Click "New Analysis" above to create a custom reference-point heatmap.'
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
            Heatmaps
          </span>
          <Select value={String(activeJobId ?? '')} onValueChange={(val) => navigate(`/experiments/${id}/heatmaps/${val}`)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {heatmapJobs.map((j: AnalysisJob) => (
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
              className={`px-4 py-2 text-sm font-medium transition-colors duration-150 ${
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
      {job && activeSubTab === 'info' && <HeatmapInfoPanel job={job} />}

      {job && activeSubTab === 'plot' && (
        job.status === 'complete' ? (
          <CustomHeatmapPlotsPanel jobId={job.id} />
        ) : (
          <Card>
            <EmptyState
              icon={Clock}
              title="Heatmap not ready"
              description="The heatmap will be available when the analysis completes."
            />
          </Card>
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <CustomHeatmapFilesPanel jobId={job.id} />
        ) : (
          <Card>
            <EmptyState
              icon={Clock}
              title="Files not ready"
              description="Files will be available when the analysis completes."
            />
          </Card>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Info Panel (simpler than DiffBind — no separate file needed)
// ---------------------------------------------------------------------------

function HeatmapInfoPanel({ job }: { job: AnalysisJob }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(job.notes ?? '');
  const updateNotes = useUpdateJobNotes();

  const launcherName = job.launcher ? getDisplayName(job.launcher) : 'Unknown';
  const params = job.params ?? {};
  const bedLabel = (params.bed_label as string) ?? 'custom regions';
  const sampleCount = ((params.samples as unknown[]) ?? []).length;

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
            <DetailRow label="Run ID"><span className="font-mono tabular-nums">{String(job.id)}</span></DetailRow>
            <DetailRow label="Created By">{launcherName}</DetailRow>
            <DetailRow label="Created Date">{formatDate(job.createdAt)}</DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={job.status} />
            </DetailRow>
            <DetailRow label="BED File">{bedLabel}</DetailRow>
            <DetailRow label="Samples"><span className="font-mono tabular-nums">{String(sampleCount)}</span></DetailRow>
          </div>
        </Card>

        {/* Methods Text */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Run Methods</h4>
            {job.methodsText && (
              <button
                onClick={handleCopyMethods}
                className="text-xs text-primary hover:text-primary/80"
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
                className="text-xs text-primary hover:text-primary/80"
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
                className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors duration-150 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
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
