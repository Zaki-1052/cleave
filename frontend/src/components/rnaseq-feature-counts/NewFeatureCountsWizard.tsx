// frontend/src/components/rnaseq-feature-counts/NewFeatureCountsWizard.tsx
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FeatureCountsSettingsStep } from './FeatureCountsSettingsStep';
import { useCreateJob, useJobs, useJob, useJobOutputs, useRnaseqQCReport } from '@/hooks/useJobs';
import { SALMON_LIB_TYPE_TO_STRANDEDNESS } from '@/lib/constants';
import type { Experiment, AnalysisJob } from '@/api/types';

interface NewFeatureCountsWizardProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
}

export function NewFeatureCountsWizard({
  isOpen,
  onClose,
  experiment,
}: NewFeatureCountsWizardProps) {
  const navigate = useNavigate();
  const createJobMutation = useCreateJob();

  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const completedAlignments = useMemo(
    () =>
      (jobsData?.items ?? []).filter(
        (j) => j.jobType === 'rnaseq_alignment' && j.status === 'complete',
      ),
    [jobsData],
  );

  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedAlignmentJobId, setSelectedAlignmentJobId] = useState<number | null>(null);
  const [strandedness, setStrandedness] = useState<number>(0);
  const [strandednessOverridden, setStrandednessOverridden] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch selected alignment job details
  const { data: selectedJob } = useJob(selectedAlignmentJobId);
  const { data: qcReport } = useRnaseqQCReport(selectedAlignmentJobId);
  const { data: bamOutputs } = useJobOutputs(selectedAlignmentJobId, 'sorted_bam');

  // Infer strandedness from Salmon library type
  const inferredStrandedness = useMemo(() => {
    if (!qcReport?.metrics?.length) return 0;
    const firstMetric = qcReport.metrics[0];
    const libType = firstMetric?.salmonLibraryType ?? 'unknown';
    return SALMON_LIB_TYPE_TO_STRANDEDNESS[libType] ?? 0;
  }, [qcReport]);

  // Build reactions from alignment job params + BAM output paths
  const reactions = useMemo(() => {
    if (!selectedJob || !bamOutputs) return [];
    const bamMap = new Map(
      bamOutputs.map((o) => [o.reactionId, o.filePath]),
    );
    const alignReactions = (selectedJob.params as Record<string, unknown>)?.reactions;
    if (!Array.isArray(alignReactions)) return [];
    return alignReactions.map((rxn: Record<string, unknown>) => ({
      reaction_id: rxn.reaction_id as number,
      short_name: rxn.short_name as string,
      bam_path: bamMap.get(rxn.reaction_id as number) ?? '',
    }));
  }, [selectedJob, bamOutputs]);

  const referenceGenome = (selectedJob?.params as Record<string, unknown>)?.reference_genome as string ?? '';

  function resetState() {
    setCurrentStep(0);
    setName('');
    setNotes('');
    setSelectedAlignmentJobId(null);
    setStrandedness(0);
    setStrandednessOverridden(false);
    setSubmitError(null);
    createJobMutation.reset();
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleNext() {
    if (currentStep === 0) {
      if (!name.trim() || selectedAlignmentJobId === null) return;
      // Auto-set strandedness from Salmon if not overridden
      if (!strandednessOverridden) {
        setStrandedness(inferredStrandedness);
      }
      setCurrentStep(1);
    }
  }

  function handleBack() {
    setCurrentStep(0);
    setSubmitError(null);
  }

  async function handleSubmit() {
    if (reactions.length === 0) {
      setSubmitError('No reactions found from the selected alignment job.');
      return;
    }
    if (reactions.some((r) => !r.bam_path)) {
      setSubmitError('Could not resolve BAM paths for all reactions.');
      return;
    }

    setSubmitError(null);
    try {
      const params = {
        experiment_id: experiment.id,
        project_id: experiment.projectId,
        reference_genome: referenceGenome,
        alignment_job_id: selectedAlignmentJobId,
        strandedness,
        reactions,
      };
      const job = await createJobMutation.mutateAsync({
        experimentId: experiment.id,
        payload: {
          jobType: 'rnaseq_feature_counts',
          name: name.trim(),
          notes: notes.trim() || null,
          params,
          parentJobId: selectedAlignmentJobId,
        },
      });
      toast.success('featureCounts job queued');
      handleClose();
      navigate(`/experiments/${experiment.id}/feature-counts/${job.id}`);
    } catch {
      setSubmitError('Failed to create featureCounts job. Please try again.');
    }
  }

  function handleSelectAlignment(job: AnalysisJob) {
    setSelectedAlignmentJobId(job.id);
    setStrandednessOverridden(false);
  }

  function handleStrandednessChange(value: number) {
    setStrandedness(value);
    setStrandednessOverridden(true);
  }

  const steps = [
    {
      label: 'Details & Alignment',
      content: jobsLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-4">
            <div>
              <Input
                id="fc-name"
                label="Run Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., featureCounts-v1"
                maxLength={30}
              />
            </div>
            <div>
              <label htmlFor="fc-notes" className="font-display text-sm font-medium text-foreground">
                Notes <span className="text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="fc-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                rows={2}
              />
            </div>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-foreground mb-2">
              Choose Alignment Run
            </h3>
            {completedAlignments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No completed RNA-seq alignment runs available. Run a STAR alignment first.
              </p>
            ) : (
              <div className="space-y-2">
                {completedAlignments.map((j) => (
                  <label
                    key={j.id}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      selectedAlignmentJobId === j.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="alignment-job"
                      checked={selectedAlignmentJobId === j.id}
                      onChange={() => handleSelectAlignment(j)}
                      className="accent-primary"
                    />
                    <div className="flex-1">
                      <span className="text-sm font-medium text-foreground">{j.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">#{j.id}</span>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      label: 'Settings',
      content: (
        <FeatureCountsSettingsStep
          referenceGenome={referenceGenome}
          strandedness={strandedness}
          onStrandednessChange={handleStrandednessChange}
          inferredStrandedness={inferredStrandedness}
          inferredLibraryType={qcReport?.metrics?.[0]?.salmonLibraryType ?? 'unknown'}
          reactions={reactions}
        />
      ),
    },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New featureCounts Run"
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      submitLabel="Start featureCounts"
      maxWidth="max-w-3xl"
      renderFooter={({ currentStep: step, onClose: close, onBack: back }) => (
        <div className="flex flex-col border-t">
          {submitError && (
            <div className="bg-red-50 dark:bg-red-950 px-6 py-2 text-sm text-red-600 dark:text-red-400">
              {submitError}
            </div>
          )}
          <div className="flex items-center justify-between px-6 py-4">
            <button onClick={close} className="text-sm text-muted-foreground hover:text-foreground">
              Cancel
            </button>
            <div className="flex gap-3">
              {step > 0 && (
                <Button variant="outlined" onClick={back}>
                  Back
                </Button>
              )}
              {step === 1 ? (
                <Button
                  onClick={handleSubmit}
                  disabled={reactions.length === 0 || createJobMutation.isPending}
                >
                  {createJobMutation.isPending ? 'Starting...' : 'Start featureCounts'}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={!name.trim() || selectedAlignmentJobId === null}
                >
                  Next
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    />
  );
}
