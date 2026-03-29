// frontend/src/components/diffbind/NewDiffBindWizard.tsx
import { Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { DiffBindDetailsStep } from './DiffBindDetailsStep';
import { ChoosePeakCallingStep } from './ChoosePeakCallingStep';
import { AssignConditionsStep } from './AssignConditionsStep';
import { DiffBindSettingsStep } from './DiffBindSettingsStep';
import { useCreateJob, useJob, useJobs, useJobOutputs } from '@/hooks/useJobs';
import type { AnalysisJob, Experiment, JobOutput } from '@/api/types';
import type { SampleAssignment } from './AssignConditionsStep';

interface NewDiffBindWizardProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
}

interface PeakCallingReaction {
  reaction_id: number;
  short_name: string;
}

/** Resolve the BAM file path for a reaction from alignment job outputs. */
function resolveReactionBam(
  reactionId: number,
  outputs: JobOutput[],
): string {
  const bam = outputs.find(
    (o) => o.reactionId === reactionId && o.fileCategory === 'unique_bam' && o.fileType === 'bam',
  );
  return bam?.filePath ?? '';
}

/** Resolve the peak BED file path for a reaction from peak calling job outputs. */
function resolveReactionPeak(
  reactionId: number,
  outputs: JobOutput[],
): string {
  // Peak files may have fileType of 'bed', 'narrowPeak', or 'broadPeak'
  const bed = outputs.find(
    (o) => o.reactionId === reactionId && o.fileCategory === 'bed',
  );
  return bed?.filePath ?? '';
}

export function NewDiffBindWizard({
  isOpen,
  onClose,
  experiment,
}: NewDiffBindWizardProps) {
  const navigate = useNavigate();
  const createJobMutation = useCreateJob();

  // Fetch all jobs for this experiment
  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const peakCallingJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) => j.jobType === 'peak_calling',
  );

  // Step tracking
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Details
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  // Step 2: Choose Peak Calling Job
  const [selectedPeakCallingJobId, setSelectedPeakCallingJobId] = useState<number | null>(null);

  // Step 3: Assign Conditions
  const [selectedReactionIds, setSelectedReactionIds] = useState<Set<number>>(new Set());
  const [assignments, setAssignments] = useState<Map<number, SampleAssignment>>(new Map());

  // Step 4: Settings
  const [analysisMethod, setAnalysisMethod] = useState('deseq2_consensus');
  const [customPeaksetOutputId, setCustomPeaksetOutputId] = useState<number | null>(null);

  // Error
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch the selected peak calling job to get its params and parent alignment job ID
  const { data: selectedPeakCallingJob, isLoading: peakJobLoading } = useJob(selectedPeakCallingJobId);
  const parentAlignmentJobId =
    (selectedPeakCallingJob?.parentJobId as number | undefined) ?? null;

  // Fetch peak calling outputs (BED files) for the custom peakset selector
  const { data: peakCallingOutputs } = useJobOutputs(selectedPeakCallingJobId, 'bed');
  const bedOutputs: JobOutput[] = peakCallingOutputs ?? [];

  // Fetch alignment job outputs (unique BAMs) to resolve BAM paths per reaction
  const { data: alignmentOutputs } = useJobOutputs(parentAlignmentJobId, 'unique_bam');

  // Extract reactions from the selected peak calling job params
  const peakCallingReactions: PeakCallingReaction[] =
    (selectedPeakCallingJob?.params?.reactions as PeakCallingReaction[] | undefined) ?? [];

  // Derive the selected reactions list for downstream use
  const selectedReactions = peakCallingReactions.filter((r) =>
    selectedReactionIds.has(r.reaction_id),
  );

  // Peak caller used in the selected job (for params)
  const peakCaller = (selectedPeakCallingJob?.params?.peak_caller as string) ?? '';

  function resetState() {
    setCurrentStep(0);
    setName('');
    setNotes('');
    setSelectedPeakCallingJobId(null);
    setSelectedReactionIds(new Set());
    setAssignments(new Map());
    setAnalysisMethod('deseq2_consensus');
    setCustomPeaksetOutputId(null);
    setSubmitError(null);
    createJobMutation.reset();
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleSelectPeakCalling(jobId: number) {
    setSelectedPeakCallingJobId(jobId);
    // Reset downstream state when peak calling selection changes
    setSelectedReactionIds(new Set());
    setAssignments(new Map());
    setCustomPeaksetOutputId(null);
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
    if (selectedReactionIds.size === peakCallingReactions.length) {
      setSelectedReactionIds(new Set());
    } else {
      setSelectedReactionIds(new Set(peakCallingReactions.map((r) => r.reaction_id)));
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
      if (selectedPeakCallingJobId === null) return;
      // Auto-select all non-IgG reactions and seed empty assignments
      if (selectedReactionIds.size === 0 && peakCallingReactions.length > 0) {
        const nonIggReactions = peakCallingReactions.filter(
          (r) => !r.short_name.toLowerCase().includes('igg'),
        );
        const ids = new Set(nonIggReactions.map((r) => r.reaction_id));
        setSelectedReactionIds(ids);
        // Seed assignments with empty conditions
        const newAssignments = new Map<number, SampleAssignment>();
        for (const rxn of nonIggReactions) {
          newAssignments.set(rxn.reaction_id, { condition: '', replicate: 1 });
        }
        setAssignments(newAssignments);
      }
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (selectedReactionIds.size < 4) return;
      // Validate that conditions are assigned
      let hasAllConditions = true;
      for (const id of selectedReactionIds) {
        const a = assignments.get(id);
        if (!a || !a.condition.trim()) {
          hasAllConditions = false;
          break;
        }
      }
      if (!hasAllConditions) return;
      setCurrentStep(3);
    }
  }

  function handleBack() {
    setCurrentStep((prev) => Math.max(0, prev - 1));
    setSubmitError(null);
  }

  /** Check whether the conditions step passes minimum requirements. */
  function isConditionsValid(): boolean {
    if (selectedReactionIds.size < 4) return false;

    const conditions = new Set<string>();
    for (const id of selectedReactionIds) {
      const a = assignments.get(id);
      if (!a || !a.condition.trim()) return false;
      conditions.add(a.condition.trim());
    }
    if (conditions.size < 2) return false;

    // Each condition needs >= 2 samples
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

  function buildDiffBindJobParams() {
    const bamOutputs = alignmentOutputs ?? [];
    const peakOutputs = peakCallingOutputs ?? [];

    // Resolve the custom peakset file path if applicable
    let customPeaksetPath: string | null = null;
    if (customPeaksetOutputId !== null) {
      const output = bedOutputs.find((o) => o.id === customPeaksetOutputId);
      customPeaksetPath = output?.filePath ?? null;
    }

    const samples = selectedReactions.map((rxn) => {
      const assignment = assignments.get(rxn.reaction_id);
      return {
        reaction_id: rxn.reaction_id,
        short_name: rxn.short_name,
        condition: assignment?.condition.trim() ?? '',
        replicate: assignment?.replicate ?? 1,
        bam_path: resolveReactionBam(rxn.reaction_id, bamOutputs),
        peak_path: resolveReactionPeak(rxn.reaction_id, peakOutputs),
        peak_caller: peakCaller,
      };
    });

    const params: Record<string, unknown> = {
      experiment_id: experiment.id,
      project_id: experiment.projectId,
      parent_job_id: selectedPeakCallingJobId,
      alignment_job_id: parentAlignmentJobId,
      analysis_method: analysisMethod,
      samples,
    };

    if (customPeaksetPath) {
      params.custom_peakset_path = customPeaksetPath;
      params.custom_peakset_output_id = customPeaksetOutputId;
    }

    return params;
  }

  async function handleSubmit() {
    if (selectedPeakCallingJobId === null) {
      setSubmitError('Please select a peak calling run.');
      return;
    }
    if (!isConditionsValid()) {
      setSubmitError(
        'Please select at least 4 reactions with at least 2 conditions and 2 replicates each.',
      );
      return;
    }
    const needsCustom =
      analysisMethod === 'deseq2_peaklist' || analysisMethod === 'edger_peaklist';
    if (needsCustom && customPeaksetOutputId === null) {
      setSubmitError('Please select a custom peakset BED file.');
      return;
    }

    setSubmitError(null);
    try {
      const params = buildDiffBindJobParams();
      const job = await createJobMutation.mutateAsync({
        experimentId: experiment.id,
        payload: {
          jobType: 'diffbind',
          name: name.trim(),
          notes: notes.trim() || null,
          params,
          parentJobId: selectedPeakCallingJobId,
        },
      });
      handleClose();
      navigate(`/experiments/${experiment.id}/diffbind/${job.id}`);
    } catch {
      setSubmitError('Failed to create DiffBind job. Please try again.');
    }
  }

  /** Determine whether the "Next" button should be disabled for the current step. */
  function isNextDisabled(): boolean {
    if (currentStep === 0) return !name.trim();
    if (currentStep === 1) return selectedPeakCallingJobId === null || peakJobLoading;
    if (currentStep === 2) return !isConditionsValid();
    return false;
  }

  /** Determine whether the "Start DiffBind" button should be disabled. */
  function isSubmitDisabled(): boolean {
    if (!isConditionsValid()) return true;
    const needsCustom =
      analysisMethod === 'deseq2_peaklist' || analysisMethod === 'edger_peaklist';
    if (needsCustom && customPeaksetOutputId === null) return true;
    return createJobMutation.isPending;
  }

  const steps = [
    {
      label: 'Details',
      content: (
        <DiffBindDetailsStep
          name={name}
          setName={setName}
          notes={notes}
          setNotes={setNotes}
        />
      ),
    },
    {
      label: 'Choose Peak Calling',
      content: jobsLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <ChoosePeakCallingStep
          peakCallingJobs={peakCallingJobs}
          selectedPeakCallingJobId={selectedPeakCallingJobId}
          onSelect={handleSelectPeakCalling}
        />
      ),
    },
    {
      label: 'Assign Conditions',
      content: (
        <AssignConditionsStep
          reactions={peakCallingReactions}
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
        <DiffBindSettingsStep
          selectedReactions={selectedReactions}
          assignments={assignments}
          analysisMethod={analysisMethod}
          setAnalysisMethod={setAnalysisMethod}
          customPeaksetOutputId={customPeaksetOutputId}
          setCustomPeaksetOutputId={setCustomPeaksetOutputId}
          bedOutputs={bedOutputs}
        />
      ),
    },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New DiffBind Analysis"
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      submitLabel="Start DiffBind"
      maxWidth="max-w-5xl"
      renderFooter={({ currentStep: step, onClose: close, onBack: back }) => (
        <div className="flex flex-col border-t">
          {submitError && (
            <div className="bg-red-50 px-6 py-2 text-sm text-red-600">{submitError}</div>
          )}
          <div className="flex items-center justify-between px-6 py-4">
            <button onClick={close} className="text-sm text-gray-500 hover:text-gray-700">
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
                  {createJobMutation.isPending ? 'Starting...' : 'Start DiffBind'}
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
