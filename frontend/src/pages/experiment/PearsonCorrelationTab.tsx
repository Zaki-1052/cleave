// frontend/src/pages/experiment/PearsonCorrelationTab.tsx
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { AnalysisJob, Experiment } from '@/api/types';
import { PearsonCorrelationFilesPanel } from '@/components/pearson-correlation/PearsonCorrelationFilesPanel';
import { PearsonCorrelationPlotsPanel } from '@/components/pearson-correlation/PearsonCorrelationPlotsPanel';
import { Card } from '@/components/layout/Card';
import { DetailRow } from '@/components/ui/DetailRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs, useUpdateJobNotes } from '@/hooks/useJobs';
import { formatDate, getDisplayName } from '@/lib/utils';

type CorrelationSubTab = 'info' | 'plot' | 'files';

const SUB_TABS: { key: CorrelationSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'plot', label: 'Plot' },
  { key: 'files', label: 'Files' },
];

export default function PearsonCorrelationTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<CorrelationSubTab>('info');

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const correlationJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) => j.jobType === 'pearson_correlation',
  );

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = correlationJobs.length > 0 ? correlationJobs[0] : null;
  const activeJobId = requestedId ?? latestJob?.id ?? null;

  const { data: job, isLoading: jobLoading } = useJob(activeJobId);

  const isLoading = jobsLoading || jobLoading;

  function handleJobChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selectedId = e.target.value;
    navigate(`/experiments/${id}/correlations/${selectedId}`);
  }

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-40 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </Card>
    );
  }

  if (correlationJobs.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="text-sm font-medium text-gray-600">No correlation runs yet</h3>
          <p className="mt-1 text-sm text-gray-400">
            Click &ldquo;New Analysis&rdquo; above to create a Pearson correlation matrix.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Job selector + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label
            htmlFor="correlation-job-select"
            className="text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Correlations
          </label>
          <select
            id="correlation-job-select"
            value={activeJobId ?? ''}
            onChange={handleJobChange}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {correlationJobs.map((j: AnalysisJob) => (
              <option key={j.id} value={j.id}>
                {j.name}
              </option>
            ))}
          </select>
        </div>
        {job && <StatusBadge status={job.status} />}
      </div>

      {/* Sub-tab navigation */}
      {job && (
        <div className="flex border-b border-gray-200">
          {SUB_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveSubTab(tab.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeSubTab === tab.key
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* Sub-tab content */}
      {job && activeSubTab === 'info' && <CorrelationInfoPanel job={job} />}

      {job && activeSubTab === 'plot' && (
        job.status === 'complete' ? (
          <PearsonCorrelationPlotsPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-gray-400">
              The correlation plot will be available when the analysis completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <PearsonCorrelationFilesPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-gray-400">
              Files will be available when the analysis completes.
            </p>
          </Card>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline Info Panel
// ---------------------------------------------------------------------------

function CorrelationInfoPanel({ job }: { job: AnalysisJob }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(job.notes ?? '');
  const updateNotes = useUpdateJobNotes();

  const launcherName = job.launcher ? getDisplayName(job.launcher) : 'Unknown';
  const params = job.params ?? {};
  const sampleCount = ((params.samples as unknown[]) ?? []).length;
  const restrictLabel = (params.restrict_bed_label as string) ?? null;

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
      { onSuccess: () => setEditing(false) },
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {/* Details */}
        <Card>
          <h4 className="mb-3 text-xs font-semibold uppercase text-gray-500">Details</h4>
          <div className="space-y-2">
            <DetailRow label="Run ID" value={String(job.id)} />
            <DetailRow label="Created By" value={launcherName} />
            <DetailRow label="Created Date" value={formatDate(job.createdAt)} />
            <DetailRow
              label="Status"
              value={<StatusBadge status={job.status} />}
            />
            <DetailRow label="Samples" value={String(sampleCount)} />
            <DetailRow
              label="Region Restriction"
              value={restrictLabel ?? 'None (genome-wide)'}
            />
          </div>
        </Card>

        {/* Methods Text */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase text-gray-500">Run Methods</h4>
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
            <p className="text-sm leading-relaxed text-gray-700">{job.methodsText}</p>
          ) : (
            <p className="text-sm text-gray-400">No methods text available.</p>
          )}
        </Card>

        {/* Notes */}
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase text-gray-500">Notes</h4>
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  className="rounded-md bg-primary px-3 py-1 text-xs text-white hover:bg-primary/90"
                  disabled={updateNotes.isPending}
                >
                  {updateNotes.isPending ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600">
              {job.notes || <span className="text-gray-400">No notes.</span>}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
