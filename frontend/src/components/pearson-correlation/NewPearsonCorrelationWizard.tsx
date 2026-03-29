// frontend/src/components/pearson-correlation/NewPearsonCorrelationWizard.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/layout/Card';
import { ChooseBigWigSourceStep, useBigWigOutputs } from '@/components/ui/ChooseBigWigSourceStep';
import { PearsonSelectSamplesStep } from './PearsonSelectSamplesStep';
import { PearsonSettingsStep } from './PearsonSettingsStep';
import { useCreateJob, useJobs } from '@/hooks/useJobs';
import { resolveReactionBigwig, type BigWigSourceType } from '@/lib/bigwig-utils';
import type { AnalysisJob, Experiment } from '@/api/types';
import type { PearsonSample } from './PearsonSelectSamplesStep';

interface NewPearsonCorrelationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
}

export function NewPearsonCorrelationWizard({
  isOpen,
  onClose,
  experiment,
}: NewPearsonCorrelationWizardProps) {
  const navigate = useNavigate();
  const createJobMutation = useCreateJob();

  // Fetch all jobs for this experiment (used by ChooseBigWigSourceStep and for reactions)
  const { data: jobsData } = useJobs(experiment.id, 1, 100);
  const allJobs: AnalysisJob[] = jobsData?.items ?? [];

  // Step tracking
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Details
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  // Step 2: Choose BigWig Source (normalization or alignment)
  const [bigwigSource, setBigwigSource] = useState<BigWigSourceType>('alignment');
  const [selectedAlignmentJobId, setSelectedAlignmentJobId] = useState<number | null>(null);
  const [selectedNormalizationJobId, setSelectedNormalizationJobId] = useState<number | null>(null);

  // Step 3: Select Samples
  const [samples, setSamples] = useState<PearsonSample[]>([]);

  // Step 4: Settings
  const [restrictBed, setRestrictBed] = useState(false);
  const [bedSource, setBedSource] = useState<'peak_calling' | 'upload'>('peak_calling');
  const [bedPath, setBedPath] = useState('');
  const [bedLabel, setBedLabel] = useState('');

  // Error
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch bigWig outputs based on selected source
  const { data: bigwigOutputs, fileCategory } = useBigWigOutputs(
    bigwigSource,
    selectedAlignmentJobId,
    selectedNormalizationJobId,
  );

  // Resolve the alignment job for reactions and genome info
  const effectiveAlignmentJobId = selectedAlignmentJobId;
  const alignmentJob = allJobs.find(
    (j) => j.id === effectiveAlignmentJobId && j.jobType === 'alignment',
  );
  const alignmentReactions: { reaction_id: number; short_name: string }[] =
    (alignmentJob?.params?.reactions as
      | { reaction_id: number; short_name: string }[]
      | undefined) ?? [];

  const referenceGenome =
    (alignmentJob?.params?.reference_genome as string) ?? '';

  function resetState() {
    setCurrentStep(0);
    setName('');
    setNotes('');
    setBigwigSource('alignment');
    setSelectedAlignmentJobId(null);
    setSelectedNormalizationJobId(null);
    setSamples([]);
    setRestrictBed(false);
    setBedSource('peak_calling');
    setBedPath('');
    setBedLabel('');
    setSubmitError(null);
    createJobMutation.reset();
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleSelectSource(
    source: BigWigSourceType,
    jobId: number,
    alignmentJobId: number,
  ) {
    setBigwigSource(source);
    if (source === 'normalization') {
      setSelectedNormalizationJobId(jobId);
      setSelectedAlignmentJobId(alignmentJobId);
    } else {
      setSelectedAlignmentJobId(jobId);
      setSelectedNormalizationJobId(null);
    }
    // Reset downstream state
    setSamples([]);
    setRestrictBed(false);
    setBedPath('');
    setBedLabel('');
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
      // Auto-populate samples from alignment reactions (exclude IgG)
      if (samples.length === 0 && alignmentReactions.length > 0) {
        const bwOutputs = bigwigOutputs ?? [];
        const newSamples = alignmentReactions
          .filter((r) => !r.short_name.toLowerCase().includes('igg'))
          .map((r) => ({
            reactionId: r.reaction_id,
            shortName: r.short_name,
            label: r.short_name,
            bigwigPath: resolveReactionBigwig(r.reaction_id, bwOutputs, fileCategory),
          }));
        setSamples(newSamples);
      }
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (samples.length < 2) return;
      setCurrentStep(3);
    }
  }

  function handleBack() {
    setCurrentStep((prev) => Math.max(0, prev - 1));
    setSubmitError(null);
  }

  function isNextDisabled(): boolean {
    if (currentStep === 0) return !name.trim();
    if (currentStep === 1) return selectedAlignmentJobId === null;
    if (currentStep === 2) return samples.length < 2;
    return false;
  }

  function isSubmitDisabled(): boolean {
    if (samples.length < 2) return true;
    if (restrictBed && !bedPath) return true;
    return createJobMutation.isPending;
  }

  async function handleSubmit() {
    if (isSubmitDisabled()) return;
    setSubmitError(null);

    const parentJobId =
      bigwigSource === 'normalization'
        ? selectedNormalizationJobId
        : selectedAlignmentJobId;

    try {
      const params: Record<string, unknown> = {
        experiment_id: experiment.id,
        project_id: experiment.projectId,
        parent_job_id: parentJobId,
        alignment_job_id: selectedAlignmentJobId,
        reference_genome: referenceGenome,
        samples: samples.map((s) => ({
          reaction_id: s.reactionId,
          short_name: s.shortName,
          label: s.label,
          bigwig_path: s.bigwigPath,
        })),
        restrict_bed_path: restrictBed ? bedPath : null,
        restrict_bed_label: restrictBed ? bedLabel : null,
        bigwig_resolution: bigwigSource === 'alignment' ? 20 : 50,
      };

      if (bigwigSource === 'normalization' && selectedNormalizationJobId) {
        params.normalization_job_id = selectedNormalizationJobId;
      }

      const job = await createJobMutation.mutateAsync({
        experimentId: experiment.id,
        payload: {
          jobType: 'pearson_correlation',
          name: name.trim(),
          notes: notes.trim() || null,
          params,
          parentJobId: parentJobId,
        },
      });
      handleClose();
      navigate(`/experiments/${experiment.id}/correlations/${job.id}`);
    } catch {
      setSubmitError('Failed to create correlation job. Please try again.');
    }
  }

  // --- Step content ---

  const detailsStep = (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          Correlation Details
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Correlation Name <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 30))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="e.g., H3K4me3 replicate correlation"
              />
              <span className="text-xs text-gray-400">{name.length}/30</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Optional notes about this analysis..."
            />
          </div>
        </div>
      </Card>
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">About</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <div>
            <h4 className="font-medium text-gray-800">What is Pearson Correlation?</h4>
            <p>
              Pairwise Pearson correlation measures the linear relationship between
              bigWig signal profiles across the genome, producing a correlation
              coefficient for each sample pair. It is widely used to assess replicate concordance
              and identify sample outliers.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-800">What Does the Pipeline Do?</h4>
            <p>
              BigWig files are read at 50bp resolution across all genomic bins.
              Zero-coverage bins are removed, and optionally a masking BED is applied.
              The Pearson correlation coefficient is computed for every sample pair
              and displayed as a heatmap.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-800">Outputs</h4>
            <p>
              Correlation heatmap (PNG + SVG), a pairwise correlation matrix CSV,
              and the raw coverage matrix CSV used for computation.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );

  const bigwigSourceStep = (
    <ChooseBigWigSourceStep
      experiment={experiment}
      bigwigSource={bigwigSource}
      selectedAlignmentJobId={selectedAlignmentJobId}
      selectedNormalizationJobId={selectedNormalizationJobId}
      onSelectSource={handleSelectSource}
      showResolutionWarning={true}
    />
  );

  const steps = [
    { label: 'Details', content: detailsStep },
    { label: 'BigWig Source', content: bigwigSourceStep },
    {
      label: 'Select Samples',
      content: (
        <PearsonSelectSamplesStep
          reactions={alignmentReactions}
          alignmentOutputs={bigwigOutputs ?? []}
          samples={samples}
          setSamples={setSamples}
          fileCategory={fileCategory}
        />
      ),
    },
    {
      label: 'Settings',
      content: (
        <PearsonSettingsStep
          experiment={experiment}
          referenceGenome={referenceGenome}
          samples={samples}
          restrictBed={restrictBed}
          setRestrictBed={setRestrictBed}
          bedSource={bedSource}
          setBedSource={setBedSource}
          bedPath={bedPath}
          setBedPath={setBedPath}
          bedLabel={bedLabel}
          setBedLabel={setBedLabel}
          setSubmitError={setSubmitError}
        />
      ),
    },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Pearson Correlation"
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      submitLabel="Start Correlation"
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
                <Button onClick={handleSubmit} disabled={isSubmitDisabled()}>
                  {createJobMutation.isPending ? 'Starting...' : 'Start Correlation'}
                </Button>
              ) : (
                <Button onClick={handleNext} disabled={isNextDisabled()}>
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
