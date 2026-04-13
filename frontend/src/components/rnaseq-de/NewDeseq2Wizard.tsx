// frontend/src/components/rnaseq-de/NewDeseq2Wizard.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { Deseq2DetailsStep } from './Deseq2DetailsStep';
import { ChooseAlignmentStep } from './ChooseAlignmentStep';
import { AssignConditionsStep } from './AssignConditionsStep';
import { Deseq2SettingsStep } from './Deseq2SettingsStep';
import { useCreateJob, useJob, useJobs, useJobOutputs } from '@/hooks/useJobs';
import type { AnalysisJob, Experiment, JobOutput } from '@/api/types';
import type { SampleAssignment } from './AssignConditionsStep';

interface NewDeseq2WizardProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
  isTrainingProject?: boolean;
}

interface AlignmentReaction {
  reaction_id: number;
  short_name: string;
}

/** Resolve the Salmon quant directory path for a reaction from alignment job outputs. */
function resolveSalmonQuantPath(
  reactionId: number,
  outputs: JobOutput[],
): string {
  const quant = outputs.find(
    (o) => o.reactionId === reactionId && o.fileCategory === 'salmon_quant',
  );
  if (!quant?.filePath) return '';
  // Salmon quant.sf is inside a directory; the parent dir is the quant path
  const parts = quant.filePath.split('/');
  parts.pop(); // remove quant.sf filename
  return parts.join('/');
}

export function NewDeseq2Wizard({
  isOpen,
  onClose,
  experiment,
  isTrainingProject = false,
}: NewDeseq2WizardProps) {
  const navigate = useNavigate();
  const createJobMutation = useCreateJob();

  // Fetch all jobs for this experiment
  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const alignmentJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) => j.jobType === 'rnaseq_alignment',
  );

  // Step tracking
  const [currentStep, setCurrentStep] = useState(0);

  // Step 0: Details
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  // Step 1: Choose Alignment Job
  const [selectedAlignmentJobId, setSelectedAlignmentJobId] = useState<number | null>(null);

  // Step 2: Assign Conditions
  const [selectedReactionIds, setSelectedReactionIds] = useState<Set<number>>(new Set());
  const [assignments, setAssignments] = useState<Map<number, SampleAssignment>>(new Map());

  // Step 3: Settings
  const [quantificationSource, setQuantificationSource] = useState(
    isTrainingProject ? '' : 'salmon',
  );
  const [referenceCondition, setReferenceCondition] = useState('');
  const [fdrThreshold, setFdrThreshold] = useState(0.05);
  const [lfcThreshold, setLfcThreshold] = useState(0);

  // Error
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch the selected alignment job to get params
  const { data: selectedAlignmentJob, isLoading: alignJobLoading } = useJob(selectedAlignmentJobId);

  // Fetch Salmon quant outputs for path resolution
  const { data: salmonOutputs } = useJobOutputs(selectedAlignmentJobId, 'salmon_quant');

  // Check for completed featureCounts jobs linked to the selected alignment
  const featureCountsJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) =>
      j.jobType === 'rnaseq_feature_counts' &&
      j.status === 'complete' &&
      j.parentJobId === selectedAlignmentJobId,
  );
  const hasFeatureCountsJob = featureCountsJobs.length > 0;

  // Fetch featureCounts outputs for count matrix path
  const latestFcJob = featureCountsJobs.length > 0 ? featureCountsJobs[0] : null;
  const { data: fcOutputs } = useJobOutputs(latestFcJob?.id ?? null, 'count_matrix');

  // Extract reactions from the selected alignment job params
  const alignmentReactions: AlignmentReaction[] =
    (selectedAlignmentJob?.params?.reactions as AlignmentReaction[] | undefined) ?? [];

  // Derive the selected reactions list
  const selectedReactions = alignmentReactions.filter((r) =>
    selectedReactionIds.has(r.reaction_id),
  );

  // Reference genome from alignment job
  const referenceGenome = (selectedAlignmentJob?.params?.reference_genome as string) ?? '';

  function resetState() {
    setCurrentStep(0);
    setName('');
    setNotes('');
    setSelectedAlignmentJobId(null);
    setSelectedReactionIds(new Set());
    setAssignments(new Map());
    setQuantificationSource(isTrainingProject ? '' : 'salmon');
    setReferenceCondition('');
    setFdrThreshold(0.05);
    setLfcThreshold(0);
    setSubmitError(null);
    createJobMutation.reset();
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleSelectAlignment(jobId: number) {
    setSelectedAlignmentJobId(jobId);
    // Reset downstream state
    setSelectedReactionIds(new Set());
    setAssignments(new Map());
    setReferenceCondition('');
  }

  function handleToggleReaction(id: number) {
    setSelectedReactionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function handleToggleAll() {
    if (selectedReactionIds.size === alignmentReactions.length) {
      setSelectedReactionIds(new Set());
    } else {
      setSelectedReactionIds(new Set(alignmentReactions.map((r) => r.reaction_id)));
    }
  }

  function handleUpdateAssignment(reactionId: number, assignment: SampleAssignment) {
    setAssignments((prev) => {
      const next = new Map(prev);
      next.set(reactionId, assignment);
      return next;
    });
  }

  function handleNext() {
    setSubmitError(null);

    if (currentStep === 0) {
      if (!name.trim()) return;
      setCurrentStep(1);
      return;
    }

    if (currentStep === 1) {
      if (selectedAlignmentJobId === null) return;
      // Auto-select all reactions and seed empty assignments
      if (selectedReactionIds.size === 0 && alignmentReactions.length > 0) {
        const ids = new Set(alignmentReactions.map((r) => r.reaction_id));
        setSelectedReactionIds(ids);
        const newAssignments = new Map<number, SampleAssignment>();
        for (const rxn of alignmentReactions) {
          newAssignments.set(rxn.reaction_id, { condition: '', replicate: 1 });
        }
        setAssignments(newAssignments);
      }
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!isConditionsValid()) return;
      setCurrentStep(3);
    }
  }

  function handleBack() {
    setCurrentStep((prev) => Math.max(0, prev - 1));
    setSubmitError(null);
  }

  function isConditionsValid(): boolean {
    if (selectedReactionIds.size < 4) return false;

    const conditions = new Set<string>();
    for (const id of selectedReactionIds) {
      const a = assignments.get(id);
      if (!a || !a.condition.trim()) return false;
      conditions.add(a.condition.trim());
    }
    if (conditions.size < 2) return false;

    for (const cond of conditions) {
      let count = 0;
      for (const id of selectedReactionIds) {
        const a = assignments.get(id);
        if (a && a.condition.trim() === cond) count++;
      }
      if (count < 2) return false;
    }
    return true;
  }

  function buildJobParams() {
    const sOutputs = salmonOutputs ?? [];

    const samples = selectedReactions.map((rxn) => {
      const assignment = assignments.get(rxn.reaction_id);
      const sample: Record<string, unknown> = {
        reaction_id: rxn.reaction_id,
        short_name: rxn.short_name,
        condition: assignment?.condition.trim() ?? '',
        replicate: assignment?.replicate ?? 1,
      };
      if (quantificationSource === 'salmon') {
        sample.salmon_quant_path = resolveSalmonQuantPath(rxn.reaction_id, sOutputs);
      }
      return sample;
    });

    const params: Record<string, unknown> = {
      experiment_id: experiment.id,
      project_id: experiment.projectId,
      reference_genome: referenceGenome,
      alignment_job_id: selectedAlignmentJobId,
      quantification_source: quantificationSource,
      fdr_threshold: fdrThreshold,
      lfc_threshold: lfcThreshold,
      samples,
    };

    if (referenceCondition) {
      params.reference_condition = referenceCondition;
    }

    if (quantificationSource === 'featurecounts' && latestFcJob) {
      params.featurecounts_job_id = latestFcJob.id;
      const matrixOutput = fcOutputs?.[0];
      if (matrixOutput) {
        params.count_matrix_path = matrixOutput.filePath;
      }
    }

    return params;
  }

  async function handleSubmit() {
    if (selectedAlignmentJobId === null) {
      setSubmitError('Please select an alignment run.');
      return;
    }
    if (!quantificationSource) {
      setSubmitError('Please select a quantification source.');
      return;
    }
    if (!isConditionsValid()) {
      setSubmitError(
        'Please select at least 4 reactions with at least 2 conditions and 2 replicates each.',
      );
      return;
    }

    setSubmitError(null);
    try {
      const params = buildJobParams();
      const job = await createJobMutation.mutateAsync({
        experimentId: experiment.id,
        payload: {
          jobType: 'rnaseq_de',
          name: name.trim(),
          notes: notes.trim() || null,
          params,
          parentJobId: selectedAlignmentJobId,
        },
      });
      toast.success('DE analysis job queued');
      handleClose();
      navigate(`/experiments/${experiment.id}/de/${job.id}`);
    } catch {
      setSubmitError('Failed to create DE analysis job. Please try again.');
    }
  }

  function isNextDisabled(): boolean {
    if (currentStep === 0) return !name.trim();
    if (currentStep === 1) return selectedAlignmentJobId === null || alignJobLoading;
    if (currentStep === 2) return !isConditionsValid();
    return false;
  }

  function isSubmitDisabled(): boolean {
    if (!quantificationSource) return true;
    if (!isConditionsValid()) return true;
    return createJobMutation.isPending;
  }

  const steps = [
    {
      label: 'Details',
      content: (
        <Deseq2DetailsStep
          name={name}
          setName={setName}
          notes={notes}
          setNotes={setNotes}
        />
      ),
    },
    {
      label: 'Choose Alignment',
      content: jobsLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <ChooseAlignmentStep
          alignmentJobs={alignmentJobs}
          selectedAlignmentJobId={selectedAlignmentJobId}
          onSelect={handleSelectAlignment}
        />
      ),
    },
    {
      label: 'Assign Conditions',
      content: (
        <AssignConditionsStep
          reactions={alignmentReactions}
          selectedIds={selectedReactionIds}
          assignments={assignments}
          onToggle={handleToggleReaction}
          onToggleAll={handleToggleAll}
          onUpdateAssignment={handleUpdateAssignment}
        />
      ),
    },
    {
      label: 'Settings',
      content: (
        <Deseq2SettingsStep
          selectedReactions={selectedReactions}
          assignments={assignments}
          quantificationSource={quantificationSource}
          setQuantificationSource={setQuantificationSource}
          referenceCondition={referenceCondition}
          setReferenceCondition={setReferenceCondition}
          fdrThreshold={fdrThreshold}
          setFdrThreshold={setFdrThreshold}
          lfcThreshold={lfcThreshold}
          setLfcThreshold={setLfcThreshold}
          hasFeatureCountsJob={hasFeatureCountsJob}
          isTrainingProject={isTrainingProject}
        />
      ),
    },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New DE Analysis (DESeq2)"
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      submitLabel="Start DE Analysis"
      maxWidth="max-w-5xl"
      renderFooter={({ currentStep: step, onClose: close, onBack: back }) => (
        <div className="flex flex-col border-t">
          {submitError && (
            <div className="bg-red-50 dark:bg-red-950 px-6 py-2 text-sm text-red-600 dark:text-red-400">{submitError}</div>
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
              {step === 3 ? (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitDisabled()}
                >
                  {createJobMutation.isPending ? 'Starting...' : 'Start DE Analysis'}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={isNextDisabled()}
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
