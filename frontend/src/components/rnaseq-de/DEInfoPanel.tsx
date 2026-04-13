// frontend/src/components/rnaseq-de/DEInfoPanel.tsx
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { AnalysisJob } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { DetailRow } from '@/components/ui/DetailRow';
import JobActions from '@/components/ui/JobActions';
import JobErrorDetails from '@/components/ui/JobErrorDetails';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useUpdateJobNotes } from '@/hooks/useJobs';
import { RNASEQ_DE_QUANTIFICATION_SOURCES } from '@/lib/constants';
import { formatDate, getDisplayName } from '@/lib/utils';

interface DEInfoPanelProps {
  job: AnalysisJob;
}

export function DEInfoPanel({ job }: DEInfoPanelProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(job.notes ?? '');
  const updateNotes = useUpdateJobNotes();

  const launcherName = job.launcher ? getDisplayName(job.launcher) : 'Unknown';

  const quantSource = (job.params?.quantification_source as string) ?? 'salmon';
  const quantLabel =
    RNASEQ_DE_QUANTIFICATION_SOURCES.find((s) => s.value === quantSource)?.label ?? quantSource;
  const refCondition = (job.params?.reference_condition as string) ?? '';
  const genome = (job.params?.reference_genome as string) ?? '';

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
          toast.success('Notes saved');
          setEditing(false);
        },
        onError: () => toast.error('Failed to save notes'),
      },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <Card className="flex-[2]">
          <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Details
          </h3>
          <div>
            <DetailRow label="Run ID"><span className="font-mono">{job.id}</span></DetailRow>
            <DetailRow label="Created By">{launcherName}</DetailRow>
            <DetailRow label="Created Date">{formatDate(job.createdAt)}</DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={job.status} />
            </DetailRow>
            <DetailRow label="Quantification">{quantLabel}</DetailRow>
            {refCondition && (
              <DetailRow label="Reference Condition">{refCondition}</DetailRow>
            )}
            {genome && (
              <DetailRow label="Genome">{genome}</DetailRow>
            )}
          </div>
        </Card>

        <Card className="flex-[3]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Run Methods
            </h3>
            {job.methodsText && (
              <button
                type="button"
                onClick={handleCopyMethods}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary-dark"
              >
                <Copy className="h-3 w-3" />
                {copied ? 'Copied!' : 'Copy'}
              </button>
            )}
          </div>
          {job.methodsText ? (
            <p className="whitespace-pre-wrap font-mono text-sm text-muted-foreground">{job.methodsText}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Methods text will be available when the DE analysis completes.
            </p>
          )}
        </Card>

        <Card className="flex-[2]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">Notes</h3>
            {!editing && (
              <button
                type="button"
                onClick={handleEditStart}
                className="text-xs font-medium text-primary hover:text-primary-dark"
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
                aria-label="Job notes"
                className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={updateNotes.isPending}
                  className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
                >
                  {updateNotes.isPending ? 'Saving...' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={updateNotes.isPending}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : job.notes ? (
            <p className="text-sm text-muted-foreground">{job.notes}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No notes</p>
          )}
        </Card>
      </div>

      <JobActions job={job} />
      <JobErrorDetails job={job} />
    </div>
  );
}
