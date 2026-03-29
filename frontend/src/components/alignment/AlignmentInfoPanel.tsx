// frontend/src/components/alignment/AlignmentInfoPanel.tsx
import { useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import type { AnalysisJob } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { DetailRow } from '@/components/ui/DetailRow';
import JobActions from '@/components/ui/JobActions';
import JobErrorDetails from '@/components/ui/JobErrorDetails';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useUpdateJobNotes } from '@/hooks/useJobs';
import { formatDate, getDisplayName } from '@/lib/utils';

interface AlignmentInfoPanelProps {
  job: AnalysisJob;
}

export function AlignmentInfoPanel({ job }: AlignmentInfoPanelProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(job.notes ?? '');
  const updateNotes = useUpdateJobNotes();

  const launcherName = job.launcher ? getDisplayName(job.launcher) : 'Unknown';

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
        {/* Details card */}
        <Card className="flex-[2]">
          <h3 className="font-display mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Details
          </h3>
          <div>
            <DetailRow label="Run ID"><span className="font-mono">{job.id}</span></DetailRow>
            <DetailRow label="Created By">{launcherName}</DetailRow>
            <DetailRow label="Created Date">{formatDate(job.createdAt)}</DetailRow>
            <DetailRow label="Status">
              <StatusBadge status={job.status} />
            </DetailRow>
          </div>
        </Card>

        {/* Run Methods card */}
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
              Methods text will be available when the alignment completes.
            </p>
          )}
        </Card>

        {/* Notes card */}
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
