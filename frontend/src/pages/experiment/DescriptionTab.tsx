// frontend/src/pages/experiment/DescriptionTab.tsx
import { Card } from '@/components/layout/Card';

export default function DescriptionTab() {
  return (
    <div className="flex gap-4">
      <Card className="flex-[2]">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Details
        </h3>
        <p className="text-sm text-gray-400">Not yet implemented</p>
      </Card>
      <Card className="flex-[3]">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
          Description
        </h3>
        <p className="text-sm text-gray-400">Not yet implemented</p>
      </Card>
    </div>
  );
}
