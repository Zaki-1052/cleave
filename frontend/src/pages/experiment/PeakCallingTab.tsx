// frontend/src/pages/experiment/PeakCallingTab.tsx
import { useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import type { Experiment } from '@/api/types';
import { PeakCallingFilesPanel } from '@/components/peak-calling/PeakCallingFilesPanel';
import { PeakCallingInfoPanel } from '@/components/peak-calling/PeakCallingInfoPanel';
import { PeakCallingInputPanel } from '@/components/peak-calling/PeakCallingInputPanel';
import { PeakCallingQCReportPanel } from '@/components/peak-calling/PeakCallingQCReportPanel';
import { IGVPanel } from '@/components/igv/IGVPanel';
import { Card } from '@/components/layout/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useJob, useJobs } from '@/hooks/useJobs';

type PeakCallingSubTab = 'info' | 'input' | 'qc-report' | 'files' | 'igv';

const SUB_TABS: { key: PeakCallingSubTab; label: string }[] = [
  { key: 'info', label: 'Info' },
  { key: 'input', label: 'Input' },
  { key: 'qc-report', label: 'QC Report' },
  { key: 'files', label: 'Files' },
  { key: 'igv', label: 'IGV' },
];

export default function PeakCallingTab() {
  const { id, jid } = useParams<{ id: string; jid: string }>();
  const { experiment } = useOutletContext<{ experiment: Experiment }>();
  const navigate = useNavigate();
  const [activeSubTab, setActiveSubTab] = useState<PeakCallingSubTab>('info');

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const peakCallingJobs = (jobsData?.items ?? []).filter((j) => j.jobType === 'peak_calling');

  const requestedId = jid && jid !== '0' ? Number(jid) : null;
  const latestJob = peakCallingJobs.length > 0 ? peakCallingJobs[0] : null;
  const activeJobId = requestedId ?? latestJob?.id ?? null;

  const { data: job, isLoading: jobLoading } = useJob(activeJobId);

  const isLoading = jobsLoading || jobLoading;

  function handleJobChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const selectedId = e.target.value;
    navigate(`/experiments/${id}/peaks/${selectedId}`);
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

  if (peakCallingJobs.length === 0) {
    return (
      <Card>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <h3 className="text-sm font-medium text-gray-600">No peak calling runs yet</h3>
          <p className="mt-1 text-sm text-gray-400">
            Click &ldquo;New Analysis&rdquo; above to create a peak calling run.
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
          <label htmlFor="peak-calling-job-select" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Peak Calling
          </label>
          <select
            id="peak-calling-job-select"
            value={activeJobId ?? ''}
            onChange={handleJobChange}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          >
            {peakCallingJobs.map((j) => (
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
      {job && activeSubTab === 'info' && <PeakCallingInfoPanel job={job} />}

      {job && activeSubTab === 'input' && <PeakCallingInputPanel job={job} />}

      {job && activeSubTab === 'qc-report' && (
        job.status === 'complete' ? (
          <PeakCallingQCReportPanel jobId={job.id} job={job} />
        ) : (
          <Card>
            <p className="text-sm text-gray-400">
              QC report will be available when the peak calling completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'files' && (
        job.status === 'complete' ? (
          <PeakCallingFilesPanel jobId={job.id} />
        ) : (
          <Card>
            <p className="text-sm text-gray-400">
              Files will be available when the peak calling completes.
            </p>
          </Card>
        )
      )}

      {job && activeSubTab === 'igv' && (
        job.status === 'complete' ? (
          <IGVPanel job={job} experimentId={experiment.id} mode="peak_calling" />
        ) : (
          <Card>
            <p className="text-sm text-gray-400">
              IGV browser will be available when the peak calling completes.
            </p>
          </Card>
        )
      )}
    </div>
  );
}
