// frontend/src/components/peak-calling/NewPeakCallingWizard.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { PeakCallingDetailsStep } from './PeakCallingDetailsStep';
import { ChooseAlignmentStep } from './ChooseAlignmentStep';
import { ChooseReactionsStep } from './ChooseReactionsStep';
import { PeakCallingSettingsStep } from './PeakCallingSettingsStep';
import { useCreateJob, useJob, useJobs, useJobOutputs } from '@/hooks/useJobs';
import { PEAK_CALLING_DEFAULTS, PEAK_SIZES } from '@/lib/constants';
import type { AnalysisJob, Experiment, JobOutput } from '@/api/types';

interface NewPeakCallingWizardProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
}

interface AlignmentReaction {
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

export function NewPeakCallingWizard({
  isOpen,
  onClose,
  experiment,
}: NewPeakCallingWizardProps) {
  const navigate = useNavigate();
  const createJobMutation = useCreateJob();

  // Fetch alignment jobs for this experiment
  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);
  const alignmentJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) => j.jobType === 'alignment',
  );

  // Step tracking
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Details
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  // Step 2: Choose Alignment
  const [selectedAlignmentJobId, setSelectedAlignmentJobId] = useState<number | null>(null);

  // Step 3: Choose Reactions
  const [selectedReactionIds, setSelectedReactionIds] = useState<Set<number>>(new Set());

  // Step 4: Settings
  const [peakCaller, setPeakCaller] = useState('SEACR');
  const [peakSize, setPeakSize] = useState('stringent');
  const [iggReactionId, setIggReactionId] = useState<number | null>(null);
  const [qValue, setQValue] = useState(PEAK_CALLING_DEFAULTS.q_value);
  const [broadCutoff, setBroadCutoff] = useState(PEAK_CALLING_DEFAULTS.broad_cutoff);
  const [seacrThreshold, setSeacrThreshold] = useState(PEAK_CALLING_DEFAULTS.seacr_threshold);
  const [sicer2Fdr, setSicer2Fdr] = useState(PEAK_CALLING_DEFAULTS.sicer2_fdr);
  const [fragmentFilter, setFragmentFilter] = useState(PEAK_CALLING_DEFAULTS.fragment_filter);
  const [fragmentSize, setFragmentSize] = useState(PEAK_CALLING_DEFAULTS.fragment_size);
  const [blacklist, setBlacklist] = useState(PEAK_CALLING_DEFAULTS.blacklist);

  // Error
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch details of the selected alignment job
  const { data: selectedAlignmentJob } = useJob(selectedAlignmentJobId);
  const { data: alignmentOutputs } = useJobOutputs(selectedAlignmentJobId, 'unique_bam');

  // Extract reactions from selected alignment job params
  const alignmentReactions: AlignmentReaction[] =
    (selectedAlignmentJob?.params?.reactions as AlignmentReaction[] | undefined) ?? [];

  const selectedReactions = alignmentReactions.filter((r) =>
    selectedReactionIds.has(r.reaction_id),
  );

  const referenceGenome =
    (selectedAlignmentJob?.params?.reference_genome as string) ?? '';

  function resetState() {
    setCurrentStep(0);
    setName('');
    setNotes('');
    setSelectedAlignmentJobId(null);
    setSelectedReactionIds(new Set());
    setPeakCaller('MACS2');
    setPeakSize('narrow');
    setIggReactionId(null);
    setQValue(PEAK_CALLING_DEFAULTS.q_value);
    setBroadCutoff(PEAK_CALLING_DEFAULTS.broad_cutoff);
    setSeacrThreshold(PEAK_CALLING_DEFAULTS.seacr_threshold);
    setSicer2Fdr(PEAK_CALLING_DEFAULTS.sicer2_fdr);
    setFragmentFilter(PEAK_CALLING_DEFAULTS.fragment_filter);
    setFragmentSize(PEAK_CALLING_DEFAULTS.fragment_size);
    setBlacklist(PEAK_CALLING_DEFAULTS.blacklist);
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
    if (selectedReactionIds.size === alignmentReactions.length) {
      setSelectedReactionIds(new Set());
    } else {
      setSelectedReactionIds(new Set(alignmentReactions.map((r) => r.reaction_id)));
    }
  }

  function handleSelectAlignment(jobId: number) {
    setSelectedAlignmentJobId(jobId);
    // Reset reaction selection when alignment changes
    setSelectedReactionIds(new Set());
    setIggReactionId(null);
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
      // Auto-select all reactions and auto-detect IgG
      if (selectedReactionIds.size === 0 && alignmentReactions.length > 0) {
        setSelectedReactionIds(new Set(alignmentReactions.map((r) => r.reaction_id)));
        // Auto-detect IgG
        const igg = alignmentReactions.find((r) =>
          r.short_name.toLowerCase().includes('igg'),
        );
        if (igg) {
          setIggReactionId(igg.reaction_id);
        }
      }
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (selectedReactionIds.size === 0) return;
      // Auto-set peak size to first valid for current caller
      const sizes = PEAK_SIZES[peakCaller] ?? [];
      const firstSize = sizes[0];
      if (firstSize && !sizes.some((s) => s.value === peakSize)) {
        setPeakSize(firstSize.value);
      }
      setCurrentStep(3);
    }
  }

  function handleBack() {
    setCurrentStep((prev) => Math.max(0, prev - 1));
    setSubmitError(null);
  }

  function buildPeakCallingJobParams() {
    const outputs = alignmentOutputs ?? [];

    // Find the IgG BAM path and short_name if an IgG control is selected
    let iggBamPath: string | null = null;
    let iggShortName: string | null = null;
    if (iggReactionId !== null) {
      iggBamPath = resolveReactionBam(iggReactionId, outputs);
      iggShortName =
        alignmentReactions.find((r) => r.reaction_id === iggReactionId)?.short_name ?? null;
    }

    const params: Record<string, unknown> = {
      experiment_id: experiment.id,
      project_id: experiment.projectId,
      parent_job_id: selectedAlignmentJobId,
      reference_genome: referenceGenome,
      peak_caller: peakCaller,
      peak_size: peakSize,
      fragment_filter: fragmentFilter,
      fragment_size: fragmentSize,
      blacklist,
      reactions: selectedReactions.map((r) => ({
        reaction_id: r.reaction_id,
        short_name: r.short_name,
        bam_path: resolveReactionBam(r.reaction_id, outputs),
        igg_bam_path: iggBamPath,
        igg_short_name: iggShortName,
      })),
    };

    // Add caller-specific threshold
    if (peakCaller === 'MACS2' && peakSize === 'narrow') {
      params.q_value = qValue;
    } else if (peakCaller === 'MACS2' && peakSize === 'broad') {
      params.broad_cutoff = broadCutoff;
    } else if (peakCaller === 'SEACR') {
      params.seacr_threshold = seacrThreshold;
    } else if (peakCaller === 'SICER2') {
      params.sicer2_fdr = sicer2Fdr;
    }

    return params;
  }

  async function handleSubmit() {
    if (selectedAlignmentJobId === null) {
      setSubmitError('Please select an alignment run.');
      return;
    }
    if (selectedReactionIds.size === 0) {
      setSubmitError('Please select at least one reaction.');
      return;
    }

    setSubmitError(null);
    try {
      const params = buildPeakCallingJobParams();
      const job = await createJobMutation.mutateAsync({
        experimentId: experiment.id,
        payload: {
          jobType: 'peak_calling',
          name: name.trim(),
          notes: notes.trim() || null,
          params,
          parentJobId: selectedAlignmentJobId,
        },
      });
      toast.success('Peak calling job queued');
      handleClose();
      navigate(`/experiments/${experiment.id}/peaks/${job.id}`);
    } catch {
      setSubmitError('Failed to create peak calling job. Please try again.');
    }
  }

  const steps = [
    {
      label: 'Details',
      content: (
        <PeakCallingDetailsStep
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
      label: 'Choose Reactions',
      content: (
        <ChooseReactionsStep
          reactions={alignmentReactions}
          selectedIds={selectedReactionIds}
          onToggle={handleToggleReaction}
          onToggleAll={handleToggleAll}
        />
      ),
    },
    {
      label: 'Peak Calling Settings',
      content: (
        <PeakCallingSettingsStep
          selectedReactions={selectedReactions}
          referenceGenome={referenceGenome}
          peakCaller={peakCaller}
          setPeakCaller={setPeakCaller}
          peakSize={peakSize}
          setPeakSize={setPeakSize}
          iggReactionId={iggReactionId}
          setIggReactionId={setIggReactionId}
          qValue={qValue}
          setQValue={setQValue}
          broadCutoff={broadCutoff}
          setBroadCutoff={setBroadCutoff}
          seacrThreshold={seacrThreshold}
          setSeacrThreshold={setSeacrThreshold}
          sicer2Fdr={sicer2Fdr}
          setSicer2Fdr={setSicer2Fdr}
          fragmentFilter={fragmentFilter}
          setFragmentFilter={setFragmentFilter}
          fragmentSize={fragmentSize}
          setFragmentSize={setFragmentSize}
          blacklist={blacklist}
          setBlacklist={setBlacklist}
        />
      ),
    },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Peak Calling"
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      submitLabel="Start Peak Calling"
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
                  disabled={selectedReactionIds.size === 0 || createJobMutation.isPending}
                >
                  {createJobMutation.isPending ? 'Starting...' : 'Start Peak Calling'}
                </Button>
              ) : (
                <Button
                  onClick={handleNext}
                  disabled={
                    (step === 0 && !name.trim()) ||
                    (step === 1 && selectedAlignmentJobId === null) ||
                    (step === 2 && selectedReactionIds.size === 0)
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
