// frontend/src/pages/experiment/DescriptionTab.tsx
import { useOutletContext } from 'react-router-dom';
import { Card } from '@/components/layout/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatBytes, formatDate, getDisplayName } from '@/lib/utils';
import type { Experiment } from '@/api/types';

interface ExperimentContext {
  experiment: Experiment;
}

const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between border-b border-gray-100 py-2 last:border-0">
    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
    <span className="text-sm text-gray-800">{children}</span>
  </div>
);

export default function DescriptionTab() {
  const { experiment } = useOutletContext<ExperimentContext>();

  const creatorName = experiment.creator
    ? getDisplayName(experiment.creator)
    : 'Unknown';

  return (
    <div className="flex gap-4">
      <Card className="flex-[2]">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Details
        </h3>
        <div>
          <DetailRow label="Experiment ID">{experiment.id}</DetailRow>
          <DetailRow label="Created By">{creatorName}</DetailRow>
          <DetailRow label="Created Date">{formatDate(experiment.createdAt)}</DetailRow>
          <DetailRow label="Status">
            <StatusBadge status={experiment.status} />
          </DetailRow>
          <DetailRow label="Size">{formatBytes(experiment.storageBytes)}</DetailRow>
        </div>
      </Card>
      <Card className="flex-[3]">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Description
        </h3>
        {experiment.description ? (
          <p className="text-sm text-gray-700">{experiment.description}</p>
        ) : (
          <p className="text-sm text-gray-400">No description provided</p>
        )}
      </Card>
    </div>
  );
}
