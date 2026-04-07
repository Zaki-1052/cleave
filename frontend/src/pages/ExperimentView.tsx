// frontend/src/pages/ExperimentView.tsx
import { useState } from 'react';
import { Link, Outlet, useParams, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  FileText, Dna, FlaskConical, Scissors, AlignLeft, Mountain,
  ArrowLeftRight, Grid3x3, ScatterChart, Scale, History,
  FolderTree, GraduationCap,
} from 'lucide-react';
import { Spinner } from '@/components/ui/Spinner';
import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/layout/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { NewAnalysisDropdown } from '@/components/experiments/NewAnalysisDropdown';
import { NewAlignmentWizard } from '@/components/alignment/NewAlignmentWizard';
import { NewPeakCallingWizard } from '@/components/peak-calling/NewPeakCallingWizard';
import { NewCustomHeatmapWizard } from '@/components/custom-heatmap/NewCustomHeatmapWizard';
import { NewDiffBindWizard } from '@/components/diffbind/NewDiffBindWizard';
import { NewPearsonCorrelationWizard } from '@/components/pearson-correlation/NewPearsonCorrelationWizard';
import { NewNormalizationWizard } from '@/components/normalization/NewNormalizationWizard';
import { AutoPipelineModal } from '@/components/experiments/AutoPipelineModal';
import { AutoPipelineBanner } from '@/components/experiments/AutoPipelineBanner';
import { useExperiment } from '@/hooks/useExperiments';
import { useJobs } from '@/hooks/useJobs';
import { useProject } from '@/hooks/useProjects';
import { useReactions } from '@/hooks/useReactions';

const JOB_TYPE_LABELS: Record<string, string> = {
  alignment: 'Alignment',
  trimming: 'Trimming',
  peak_calling: 'Peak Calling',
  diffbind: 'DiffBind',
  custom_heatmap: 'Custom Heatmap',
  pearson_correlation: 'Correlation',
  roman_normalization: 'Normalization',
};

const TABS: { label: string; path: string; icon: LucideIcon }[] = [
  { label: 'Description', path: 'description', icon: FileText },
  { label: 'FASTQs', path: 'fastqs', icon: Dna },
  { label: 'Reactions', path: 'reactions', icon: FlaskConical },
  { label: 'Trimming', path: 'trimming/0', icon: Scissors },
  { label: 'Alignment', path: 'alignment/0', icon: AlignLeft },
  { label: 'Peak Calling', path: 'peaks/0', icon: Mountain },
  { label: 'DiffBind', path: 'diffbind/0', icon: ArrowLeftRight },
  { label: 'Normalization', path: 'normalization/0', icon: Scale },
  { label: 'Heatmaps', path: 'heatmaps/0', icon: Grid3x3 },
  { label: 'Correlation', path: 'correlations/0', icon: ScatterChart },
  { label: 'History', path: 'history', icon: History },
  { label: 'All Files', path: 'files', icon: FolderTree },
];

export default function ExperimentView() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const { data: experiment, isLoading } = useExperiment(Number(id));
  const { data: parentProject } = useProject(experiment?.projectId ?? 0);
  const isReadOnly = parentProject?.isReference ?? false;
  const isTrainingProject = parentProject?.isTraining ?? false;
  const { data: jobsData } = useJobs(Number(id), 1, 1);
  const [showAlignmentWizard, setShowAlignmentWizard] = useState(false);
  const [showPeakCallingWizard, setShowPeakCallingWizard] = useState(false);
  const [showDiffBindWizard, setShowDiffBindWizard] = useState(false);
  const [showCustomHeatmapWizard, setShowCustomHeatmapWizard] = useState(false);
  const [showPearsonCorrelationWizard, setShowPearsonCorrelationWizard] = useState(false);
  const [showNormalizationWizard, setShowNormalizationWizard] = useState(false);
  const [showAutoPipelineModal, setShowAutoPipelineModal] = useState(false);
  const { data: reactionsData } = useReactions(Number(id));
  const reactions = reactionsData?.items ?? [];

  const lastJob = jobsData?.items?.[0] ?? null;
  const lastJobLabel = lastJob
    ? JOB_TYPE_LABELS[lastJob.jobType] ?? lastJob.jobType
    : 'None';

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!experiment) {
    return (
      <Card>
        <p className="text-muted-foreground">Experiment not found</p>
      </Card>
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-xl font-bold text-foreground">{experiment.name}</h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Last Job:</span>
            {lastJob ? (
              <span className="font-medium text-foreground">{lastJobLabel}</span>
            ) : (
              <span className="text-muted-foreground">None</span>
            )}
          </div>
          <StatusBadge status={experiment.status} />
        </div>
        {!isReadOnly && (
          <div className="flex items-center gap-2">
            {!isTrainingProject && (!experiment.autoPipelineStatus || experiment.autoPipelineStatus === 'cancelled') && reactions.length > 0 && (
              <Button
                variant="success"
                onClick={() => setShowAutoPipelineModal(true)}
              >
                Run Full Pipeline
              </Button>
            )}
            <NewAnalysisDropdown
              onAlignmentClick={() => setShowAlignmentWizard(true)}
              onPeakCallingClick={() => setShowPeakCallingWizard(true)}
              onDiffBindClick={() => setShowDiffBindWizard(true)}
              onCustomHeatmapClick={() => setShowCustomHeatmapWizard(true)}
              onPearsonCorrelationClick={() => setShowPearsonCorrelationWizard(true)}
              onNormalizationClick={() => setShowNormalizationWizard(true)}
            />
          </div>
        )}
      </div>

      {isTrainingProject && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 dark:border-teal-800 dark:bg-teal-950">
          <GraduationCap className="h-5 w-5 shrink-0 text-teal-600 dark:text-teal-400" />
          <div>
            <p className="text-sm font-medium text-teal-800 dark:text-teal-200">
              Training Project
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-400">
              This is your first project. Auto-pipeline is disabled so you can learn each analysis
              step. Defaults have been cleared — read the hints and choose your own parameters.
            </p>
          </div>
        </div>
      )}

      {experiment.autoPipelineStatus && (
        <AutoPipelineBanner
          experiment={experiment}
          onCancelled={() => {
            void queryClient.invalidateQueries({ queryKey: ['experiments', experiment.id] });
          }}
          onRetried={() => {
            void queryClient.invalidateQueries({ queryKey: ['experiments', experiment.id] });
          }}
          onDismissed={() => {
            void queryClient.invalidateQueries({ queryKey: ['experiments', experiment.id] });
          }}
        />
      )}

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
                  className={`flex items-center gap-2 px-4 py-3 text-sm transition-all duration-150 ${
                    isActive
                      ? 'border-l-2 border-primary bg-primary/5 dark:bg-primary/10 font-semibold text-primary'
                      : 'border-l-2 border-transparent text-muted-foreground hover:bg-card/50 hover:text-foreground'
                  }`}
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </Link>
              );
            })}
          </Card>
        </aside>

        <div className="flex-1">
          <Outlet context={{ experiment, isReadOnly, isTrainingProject }} />
        </div>
      </div>

      <NewAlignmentWizard
        isOpen={showAlignmentWizard}
        onClose={() => setShowAlignmentWizard(false)}
        experiment={experiment}
        isTrainingProject={isTrainingProject}
      />

      <NewPeakCallingWizard
        isOpen={showPeakCallingWizard}
        onClose={() => setShowPeakCallingWizard(false)}
        experiment={experiment}
        isTrainingProject={isTrainingProject}
      />

      <NewDiffBindWizard
        isOpen={showDiffBindWizard}
        onClose={() => setShowDiffBindWizard(false)}
        experiment={experiment}
        isTrainingProject={isTrainingProject}
      />

      <NewCustomHeatmapWizard
        isOpen={showCustomHeatmapWizard}
        onClose={() => setShowCustomHeatmapWizard(false)}
        experiment={experiment}
      />

      <NewPearsonCorrelationWizard
        isOpen={showPearsonCorrelationWizard}
        onClose={() => setShowPearsonCorrelationWizard(false)}
        experiment={experiment}
      />

      <NewNormalizationWizard
        isOpen={showNormalizationWizard}
        onClose={() => setShowNormalizationWizard(false)}
        experiment={experiment}
      />

      <AutoPipelineModal
        isOpen={showAutoPipelineModal}
        onClose={() => setShowAutoPipelineModal(false)}
        experiment={experiment}
        reactions={reactions}
        onStarted={() => {
          // Refetch experiment to pick up new auto_pipeline_status
        }}
      />
    </div>
  );
}
