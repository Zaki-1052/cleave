// frontend/src/components/alignment/NewAlignmentWizard.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { AlignmentDetailsStep } from './AlignmentDetailsStep';
import { ChooseReactionsStep } from './ChooseReactionsStep';
import { AlignmentSettingsStep } from './AlignmentSettingsStep';
import { useReactions } from '@/hooks/useReactions';
import { useFastqs } from '@/hooks/useFastqs';
import { useCreateJob } from '@/hooks/useJobs';
import { REFERENCE_GENOMES } from '@/lib/constants';
import type { Experiment, FastqFile, Reaction } from '@/api/types';

interface NewAlignmentWizardProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
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
  return {
    r1_path: r1?.filePath ?? '',
    r2_path: r2?.filePath ?? '',
    total_reads: r1?.totalReads ?? null,
  };
}

/** Auto-select the default genome for a set of organisms. */
function getDefaultGenome(organisms: string[]): string {
  const org = organisms.length === 1 ? organisms[0] : undefined;
  if (!org) return '';
  const genomes = REFERENCE_GENOMES[org];
  return genomes?.[0]?.value ?? '';
}

export function NewAlignmentWizard({
  isOpen,
  onClose,
  experiment,
}: NewAlignmentWizardProps) {
  const navigate = useNavigate();

  // Data fetching
  const { data: reactionsData, isLoading: reactionsLoading } = useReactions(experiment.id);
  const { data: fastqsData, isLoading: fastqsLoading } = useFastqs(experiment.id, 1, 500);
  const createJobMutation = useCreateJob();

  // Step tracking
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Details
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  // Step 2: Reaction selection
  const [selectedReactionIds, setSelectedReactionIds] = useState<Set<number>>(new Set());

  // Step 3: Settings
  const [referenceGenome, setReferenceGenome] = useState('');
  const [removeDuplicates, setRemoveDuplicates] = useState(true);
  const [removeDacExclusion, setRemoveDacExclusion] = useState(true);
  const [bamCoverageBinSize, setBamCoverageBinSize] = useState(20);
  const [smoothedBinSize, setSmoothedBinSize] = useState(100);

  // Error
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
    setRemoveDuplicates(true);
    setRemoveDacExclusion(true);
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
      // Auto-select reference genome based on selected reactions' organisms
      const organisms = [...new Set(selectedReactions.map((r) => r.organism))];
      if (!referenceGenome) {
        setReferenceGenome(getDefaultGenome(organisms));
      }
      setCurrentStep(2);
    }
  }

  function handleBack() {
    setCurrentStep((prev) => Math.max(0, prev - 1));
    setSubmitError(null);
  }

  function buildAlignmentJobParams() {
    return {
      experiment_id: experiment.id,
      project_id: experiment.projectId,
      reference_genome: referenceGenome,
      remove_duplicates: removeDuplicates,
      remove_dac_exclusion: removeDacExclusion,
      bam_coverage_bin_size: bamCoverageBinSize,
      smoothed_bin_size: smoothedBinSize,
      reactions: selectedReactions.map((r) => {
        const paths = resolveFastqPaths(r, allFastqs);
        return {
          reaction_id: r.id,
          short_name: r.shortName,
          r1_path: paths.r1_path,
          r2_path: paths.r2_path,
          total_reads: paths.total_reads,
          ecoli_spike_in: r.ecoliSpikeIn,
          cutana_spike_in: r.cutanaSpikeIn,
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

    setSubmitError(null);
    try {
      const params = buildAlignmentJobParams();
      const job = await createJobMutation.mutateAsync({
        experimentId: experiment.id,
        payload: {
          jobType: 'alignment',
          name: name.trim(),
          notes: notes.trim() || null,
          params,
        },
      });
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
        <AlignmentDetailsStep
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
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
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
        <AlignmentSettingsStep
          selectedReactions={selectedReactions}
          referenceGenome={referenceGenome}
          setReferenceGenome={setReferenceGenome}
          removeDuplicates={removeDuplicates}
          setRemoveDuplicates={setRemoveDuplicates}
          removeDacExclusion={removeDacExclusion}
          setRemoveDacExclusion={setRemoveDacExclusion}
          bamCoverageBinSize={bamCoverageBinSize}
          setBamCoverageBinSize={setBamCoverageBinSize}
          smoothedBinSize={smoothedBinSize}
          setSmoothedBinSize={setSmoothedBinSize}
        />
      ),
    },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Alignment"
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
              {step === 2 ? (
                <Button
                  onClick={handleSubmit}
                  disabled={!referenceGenome || createJobMutation.isPending}
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
