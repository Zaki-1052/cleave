// frontend/src/pages/experiment/DescriptionTab.tsx
import { useOutletContext } from 'react-router-dom';
import type { Experiment } from '@/api/types';
import { Card } from '@/components/layout/Card';
import { DetailRow } from '@/components/ui/DetailRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StorageGauge } from '@/components/ui/StorageGauge';
import { useStorageInfo } from '@/hooks/useProjects';
import { formatDate, getDisplayName } from '@/lib/utils';

interface ExperimentContext {
  experiment: Experiment;
}

export default function DescriptionTab() {
  const { experiment } = useOutletContext<ExperimentContext>();
  const { data: storageInfo } = useStorageInfo();

  const creatorName = experiment.creator
    ? getDisplayName(experiment.creator)
    : 'Unknown';

  return (
    <div className="flex gap-4">
      <Card className="flex-[2]">
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Details
        </h3>
        <div>
          <DetailRow label="Experiment ID"><span className="font-mono">{experiment.id}</span></DetailRow>
          <DetailRow label="Created By">{creatorName}</DetailRow>
          <DetailRow label="Created Date">{formatDate(experiment.createdAt)}</DetailRow>
          <DetailRow label="Status">
            <StatusBadge status={experiment.status} />
          </DetailRow>
          <DetailRow label="Size">
            <StorageGauge
              usedBytes={experiment.storageBytes}
              quotaBytes={storageInfo?.quotaBytes}
            />
          </DetailRow>
        </div>
      </Card>
      <Card className="flex-[3]">
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Description
        </h3>
        {experiment.description ? (
          <p className="text-sm text-foreground">{experiment.description}</p>
        ) : (
          <p className="text-sm text-muted-foreground">No description provided</p>
        )}
      </Card>
    </div>
  );
}
