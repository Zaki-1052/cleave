// frontend/src/pages/ExperimentView.tsx
import { Link, Outlet, useParams, useLocation } from 'react-router-dom';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';

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

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-800">Experiment {id}</h1>
        </div>
        <Button>New Analysis ▼</Button>
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
          <Outlet />
        </div>
      </div>
    </div>
  );
}
