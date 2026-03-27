// frontend/src/pages/ExperimentView.tsx
import { useState } from 'react';
import { Link, Outlet, useParams, useLocation } from 'react-router-dom';
import { Card } from '@/components/layout/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NewAnalysisDropdown } from '@/components/experiments/NewAnalysisDropdown';
import { NewAlignmentWizard } from '@/components/alignment/NewAlignmentWizard';
import { useExperiment } from '@/hooks/useExperiments';

const TABS = [
  { label: 'Description', path: 'description' },
  { label: 'FASTQs', path: 'fastqs' },
  { label: 'Reactions', path: 'reactions' },
  { label: 'Alignment', path: 'alignment/0' },
  { label: 'Peak Calling', path: 'peaks/0' },
  { label: 'History', path: 'history' },
  { label: 'All Files', path: 'files' },
] as const;

export default function ExperimentView() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const { data: experiment, isLoading } = useExperiment(Number(id));
  const [showAlignmentWizard, setShowAlignmentWizard] = useState(false);

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!experiment) {
    return (
      <Card>
        <p className="text-gray-500">Experiment not found</p>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-gray-800">{experiment.name}</h1>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Last Job:</span>
            <span className="text-gray-400">None</span>
          </div>
          <StatusBadge status={experiment.status} />
        </div>
        <NewAnalysisDropdown onAlignmentClick={() => setShowAlignmentWizard(true)} />
      </div>

      <div className="flex gap-6">
        <aside className="w-48 shrink-0">
          <Card className="p-0">
            {TABS.map((tab) => {
              const isActive = pathname.includes(tab.path) ||
                (tab.path === 'description' && pathname.endsWith(`/experiments/${id}`));
              return (
                <Link
                  key={tab.path}
                  to={`/experiments/${id}/${tab.path}`}
                  className={`block px-4 py-3 text-sm transition-colors ${
                    isActive
                      ? 'bg-white font-semibold text-primary'
                      : 'text-gray-600 hover:bg-white/50'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </Card>
        </aside>

        <div className="flex-1">
          <Outlet context={{ experiment }} />
        </div>
      </div>

      <NewAlignmentWizard
        isOpen={showAlignmentWizard}
        onClose={() => setShowAlignmentWizard(false)}
        experiment={experiment}
      />
    </div>
  );
}
