// frontend/src/components/rnaseq-alignment/NewRnaseqAlignmentWizard.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { RnaseqAlignmentDetailsStep } from './RnaseqAlignmentDetailsStep';
import { ChooseReactionsStep } from '@/components/alignment/ChooseReactionsStep';
import { RnaseqAlignmentSettingsStep } from './RnaseqAlignmentSettingsStep';
import { useReactions } from '@/hooks/useReactions';
import { useFastqs } from '@/hooks/useFastqs';
import { useCreateJob } from '@/hooks/useJobs';
import { RNASEQ_REFERENCE_GENOMES } from '@/lib/constants';
import type { Experiment, FastqFile, Reaction } from '@/api/types';

interface NewRnaseqAlignmentWizardProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
  isTrainingProject?: boolean;
}

/** Resolve the best R1/R2 FASTQ file paths for a reaction, preferring trimmed. */
function resolveFastqPaths(reaction: Reaction, fastqs: FastqFile[]) {
  const matching = fastqs.filter((f) => f.prefix === reaction.fastqPrefix);
  const r1 =
    matching.find((f) => f.isTrimmed && f.readDirection === 'R1') ??
    matching.find((f) => !f.isTrimmed && f.readDirection === 'R1');
  const r2 =
    matching.find((f) => f.isTrimmed && f.readDirection === 'R2') ??
    matching.find((f) => !f.isTrimmed && f.readDirection === 'R2');
  return { r1_path: r1?.filePath ?? '', r2_path: r2?.filePath ?? '' };
}

/** Auto-select the default genome for a set of organisms. */
function getDefaultGenome(organisms: string[]): string {
  const org = organisms.length === 1 ? organisms[0] : undefined;
  if (!org) return '';
  const genomes = RNASEQ_REFERENCE_GENOMES[org];
  return genomes?.[0]?.value ?? '';
}

export function NewRnaseqAlignmentWizard({
  isOpen,
  onClose,
  experiment,
  isTrainingProject = false,
}: NewRnaseqAlignmentWizardProps) {
  const navigate = useNavigate();

  const { data: reactionsData, isLoading: reactionsLoading } = useReactions(experiment.id);
  const { data: fastqsData, isLoading: fastqsLoading } = useFastqs(experiment.id, 1, 500);
  const createJobMutation = useCreateJob();

  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Details
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  // Step 2: Reaction selection
  const [selectedReactionIds, setSelectedReactionIds] = useState<Set<number>>(new Set());

  // Step 3: Settings (RNA-seq defaults: duplicates OFF)
  const [referenceGenome, setReferenceGenome] = useState('');
  const [removeDuplicates, setRemoveDuplicates] = useState<boolean | null>(
    isTrainingProject ? null : false,
  );
  const [bamCoverageBinSize, setBamCoverageBinSize] = useState(20);
  const [smoothedBinSize, setSmoothedBinSize] = useState(100);

  const [submitError, setSubmitError] = useState<string | null>(null);

  const allReactions = reactionsData?.items ?? [];
  const allFastqs = fastqsData?.items ?? [];
  const selectedReactions = allReactions.filter((r) => selectedReactionIds.has(r.id));

  function resetState() {
    setCurrentStep(0);
    setName('');
    setNotes('');
    setSelectedReactionIds(new Set());
    setReferenceGenome('');
    setRemoveDuplicates(isTrainingProject ? null : false);
    setBamCoverageBinSize(20);
    setSmoothedBinSize(100);
    setSubmitError(null);
    createJobMutation.reset();
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleToggleReaction(id: number) {
    setSelectedReactionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleToggleAll() {
    if (selectedReactionIds.size === allReactions.length) {
      setSelectedReactionIds(new Set());
    } else {
      setSelectedReactionIds(new Set(allReactions.map((r) => r.id)));
    }
  }

  function handleNext() {
    if (currentStep === 0) {
      if (!name.trim()) return;
      setCurrentStep(1);
      return;
    }

    if (currentStep === 1) {
      if (selectedReactionIds.size === 0) return;
      if (!isTrainingProject) {
        const organisms = [...new Set(selectedReactions.map((r) => r.organism))];
        if (!referenceGenome) {
          setReferenceGenome(getDefaultGenome(organisms));
        }
      }
      setCurrentStep(2);
    }
  }

  function handleBack() {
    setCurrentStep((prev) => Math.max(0, prev - 1));
    setSubmitError(null);
  }

  function buildParams() {
    return {
      experiment_id: experiment.id,
      project_id: experiment.projectId,
      reference_genome: referenceGenome,
      remove_duplicates: removeDuplicates ?? false,
      bam_coverage_bin_size: bamCoverageBinSize,
      smoothed_bin_size: smoothedBinSize,
      reactions: selectedReactions.map((r) => {
        const paths = resolveFastqPaths(r, allFastqs);
        return {
          reaction_id: r.id,
          short_name: r.shortName,
          r1_path: paths.r1_path,
          r2_path: paths.r2_path,
        };
      }),
    };
  }

  async function handleSubmit() {
    if (!referenceGenome) {
      setSubmitError('Please select a reference genome.');
      return;
    }
    if (selectedReactionIds.size === 0) {
      setSubmitError('Please select at least one reaction.');
      return;
    }
    if (removeDuplicates === null) {
      setSubmitError('Please choose a value for Remove Duplicate Reads in Advanced Settings.');
      return;
    }

    setSubmitError(null);
    try {
      const params = buildParams();
      const job = await createJobMutation.mutateAsync({
        experimentId: experiment.id,
        payload: {
          jobType: 'rnaseq_alignment',
          name: name.trim(),
          notes: notes.trim() || null,
          params,
        },
      });
      toast.success('RNA-seq alignment job queued');
      handleClose();
      navigate(`/experiments/${experiment.id}/alignment/${job.id}`);
    } catch {
      setSubmitError('Failed to create alignment job. Please try again.');
    }
  }

  const isDataLoading = reactionsLoading || fastqsLoading;

  const steps = [
    {
      label: 'Details',
      content: (
        <RnaseqAlignmentDetailsStep
          name={name}
          setName={setName}
          notes={notes}
          setNotes={setNotes}
        />
      ),
    },
    {
      label: 'Choose Reactions',
      content: isDataLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : (
        <ChooseReactionsStep
          reactions={allReactions}
          selectedIds={selectedReactionIds}
          onToggle={handleToggleReaction}
          onToggleAll={handleToggleAll}
        />
      ),
    },
    {
      label: 'Alignment Settings',
      content: (
        <RnaseqAlignmentSettingsStep
          selectedReactions={selectedReactions}
          referenceGenome={referenceGenome}
          setReferenceGenome={setReferenceGenome}
          removeDuplicates={removeDuplicates}
          setRemoveDuplicates={setRemoveDuplicates}
          bamCoverageBinSize={bamCoverageBinSize}
          setBamCoverageBinSize={setBamCoverageBinSize}
          smoothedBinSize={smoothedBinSize}
          setSmoothedBinSize={setSmoothedBinSize}
          isTrainingProject={isTrainingProject}
        />
      ),
    },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New RNA-seq Alignment"
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      submitLabel="Start Alignment"
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
              {step === 2 ? (
                <Button
                  onClick={handleSubmit}
                  disabled={!referenceGenome || removeDuplicates === null || createJobMutation.isPending}
                >
                  {createJobMutation.isPending ? 'Starting...' : 'Start Alignment'}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={
                    (step === 0 && !name.trim()) ||
                    (step === 1 && selectedReactionIds.size === 0)
                  }
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
