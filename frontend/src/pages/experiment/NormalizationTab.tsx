// frontend/src/pages/experiment/NormalizationTab.tsx
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { AnalysisJob, Experiment } from '@/api/types';
import { NormalizationFilesPanel } from '@/components/normalization/NormalizationFilesPanel';
import { NormalizationResultsPanel } from '@/components/normalization/NormalizationResultsPanel';
import { Card } from '@/components/layout/Card';
import { DetailRow } from '@/components/ui/DetailRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs, useUpdateJobNotes } from '@/hooks/useJobs';
import { formatDate, getDisplayName } from '@/lib/utils';

type NormalizationSubTab = 'info' | 'results' | 'files';

const SUB_TABS: { key: NormalizationSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'results', label: 'Results' },
  { key: 'files', label: 'Files' },
];

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

  function handleJobChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selectedId = e.target.value;
    navigate(`/experiments/${id}/normalization/${selectedId}`);
  }

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-40 items-center justify-center">
          <Spinner size="lg" />
        </div>
      </Card>
    );
  }

  if (normalizationJobs.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="text-sm font-medium text-gray-600">No normalization runs yet</h3>
          <p className="mt-1 text-sm text-gray-400">
            Click &ldquo;New Analysis&rdquo; above to create a Roman normalization.
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
            htmlFor="normalization-job-select"
            className="font-display text-xs font-semibold uppercase tracking-wide text-gray-500"
          >
            Normalizations
          </label>
          <select
            id="normalization-job-select"
            value={activeJobId ?? ''}
            onChange={handleJobChange}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {normalizationJobs.map((j: AnalysisJob) => (
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
              className={`px-4 py-2 text-sm font-medium transition-all duration-150 ${
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
      {job && activeSubTab === 'info' && <NormalizationInfoPanel job={job} />}

      {job && activeSubTab === 'results' && (
        job.status === 'complete' ? (
          <NormalizationResultsPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-gray-400">
              Normalization results will be available when the analysis completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <NormalizationFilesPanel jobId={job.id} />
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
          <h4 className="mb-3 font-display text-xs font-semibold uppercase tracking-wide text-gray-500">Details</h4>
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
