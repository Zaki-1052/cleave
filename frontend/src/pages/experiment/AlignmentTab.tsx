// frontend/src/pages/experiment/AlignmentTab.tsx
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { Experiment } from '@/api/types';
import { AlignmentQCReportPanel } from '@/components/alignment/AlignmentQCReportPanel';
import { Card } from '@/components/layout/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs } from '@/hooks/useJobs';
import { GENOME_DISPLAY_NAMES } from '@/lib/constants';
import { formatDateTime, formatDuration } from '@/lib/utils';

type AlignmentSubTab = 'info' | 'input' | 'qc-report' | 'files' | 'igv';

const SUB_TABS: { key: AlignmentSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'input', label: 'Input' },
  { key: 'qc-report', label: 'QC Report' },
  { key: 'files', label: 'Files' },
  { key: 'igv', label: 'IGV' },
];

export default function AlignmentTab() {
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

  function handleJobChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selectedId = e.target.value;
    navigate(`/experiments/${id}/alignment/${selectedId}`);
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

  if (alignmentJobs.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="text-sm font-medium text-gray-600">No alignment runs yet</h3>
          <p className="mt-1 text-sm text-gray-400">
            Click &ldquo;New Analysis&rdquo; above to create an alignment run.
          </p>
        </div>
      </Card>
    );
  }

  const genome = job?.params?.reference_genome as string | undefined;

  return (
    <div className="space-y-4">
      {/* Job selector + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Alignments
          </label>
          <select
            value={activeJobId ?? ''}
            onChange={handleJobChange}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {alignmentJobs.map((j) => (
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
      {job && activeSubTab === 'info' && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Alignment Details
          </h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Run ID
              </span>
              <p className="text-gray-800">{job.id}</p>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Status
              </span>
              <div className="mt-0.5">
                <StatusBadge status={job.status} />
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Created Date
              </span>
              <p className="text-gray-800">{formatDateTime(job.createdAt)}</p>
            </div>
            {genome && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Reference Genome
                </span>
                <p className="text-gray-800">{GENOME_DISPLAY_NAMES[genome] ?? genome}</p>
              </div>
            )}
            {job.startedAt && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Started
                </span>
                <p className="text-gray-800">{formatDateTime(job.startedAt)}</p>
              </div>
            )}
            {job.completedAt && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Completed
                </span>
                <p className="text-gray-800">{formatDateTime(job.completedAt)}</p>
              </div>
            )}
            {job.durationSeconds != null && (
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Duration
                </span>
                <p className="text-gray-800">{formatDuration(job.durationSeconds)}</p>
              </div>
            )}
          </div>

          {job.errorMessage && (
            <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
              {job.errorMessage}
            </div>
          )}

          {job.methodsText && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Run Methods
              </h4>
              <p className="whitespace-pre-wrap text-sm text-gray-600">
                {job.methodsText}
              </p>
            </div>
          )}

          {job.notes && (
            <div className="mt-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                Notes
              </h4>
              <p className="text-sm text-gray-600">{job.notes}</p>
            </div>
          )}
        </Card>
      )}

      {job && activeSubTab === 'qc-report' && (
        job.status === 'complete' ? (
          <AlignmentQCReportPanel jobId={job.id} job={job} />
        ) : (
          <Card>
            <p className="text-sm text-gray-400">
              QC report will be available when the alignment completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'input' && (
        <Card>
          <p className="text-sm text-gray-400">Input details coming in Step 3.6.</p>
        </Card>
      )}

      {job && activeSubTab === 'files' && (
        <Card>
          <p className="text-sm text-gray-400">Files browser coming in Step 3.6.</p>
        </Card>
      )}

      {job && activeSubTab === 'igv' && (
        <Card>
          <p className="text-sm text-gray-400">IGV genome browser coming in Phase 5.</p>
        </Card>
      )}
    </div>
  );
}
