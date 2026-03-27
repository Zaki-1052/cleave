// frontend/src/pages/experiment/AlignmentTab.tsx
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Card } from '@/components/layout/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs } from '@/hooks/useJobs';
import { GENOME_DISPLAY_NAMES } from '@/lib/constants';
import { formatDateTime, formatDuration } from '@/lib/utils';
import type { Experiment } from '@/api/types';

export default function AlignmentTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();

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

      {/* Job details card */}
      {job && (
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

          {job.status === 'complete' && (
            <p className="mt-4 text-sm text-gray-400">
              QC Report, Files, and IGV browser coming in the next step.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
