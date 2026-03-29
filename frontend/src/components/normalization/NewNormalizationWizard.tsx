// frontend/src/components/normalization/NewNormalizationWizard.tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Spinner } from '@/components/ui/Spinner';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/layout/Card';
import { NormalizationSelectSamplesStep } from './NormalizationSelectSamplesStep';
import { NormalizationSettingsStep } from './NormalizationSettingsStep';
import { useCreateJob, useJobs, useJobOutputs } from '@/hooks/useJobs';
import type { AnalysisJob, Experiment, JobOutput } from '@/api/types';
import type { NormalizationSample } from './NormalizationSelectSamplesStep';

interface NewNormalizationWizardProps {
  isOpen: boolean;
  onClose: () => void;
  experiment: Experiment;
}

function resolveReactionBigwig(reactionId: number, outputs: JobOutput[]): string {
  const bw = outputs.find(
    (o) => o.reactionId === reactionId && o.fileCategory === 'bigwig' && o.fileType === 'bw',
  );
  return bw?.filePath ?? '';
}

export function NewNormalizationWizard({
  isOpen,
  onClose,
  experiment,
}: NewNormalizationWizardProps) {
  const navigate = useNavigate();
  const createJobMutation = useCreateJob();

  // Fetch all jobs for this experiment
  const { data: jobsData, isLoading: jobsLoading } = useJobs(experiment.id, 1, 100);

  // Only show completed alignment jobs with mm10 reference genome
  const alignmentJobs = (jobsData?.items ?? []).filter(
    (j: AnalysisJob) =>
      j.jobType === 'alignment' &&
      j.status === 'complete' &&
      (j.params as Record<string, unknown>)?.reference_genome === 'mm10',
  );

  // Step tracking
  const [currentStep, setCurrentStep] = useState(0);

  // Step 1: Details
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  // Step 2: Choose Alignment
  const [selectedAlignmentJobId, setSelectedAlignmentJobId] = useState<number | null>(null);

  // Step 3: Select Samples
  const [samples, setSamples] = useState<NormalizationSample[]>([]);

  // Error
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch alignment job outputs (bigWig files) to resolve paths per reaction
  const { data: alignmentOutputs } = useJobOutputs(selectedAlignmentJobId, 'bigwig');

  // Extract reactions from the selected alignment job params
  const selectedAlignmentJob = alignmentJobs.find(
    (j: AnalysisJob) => j.id === selectedAlignmentJobId,
  );
  const alignmentReactions: { reaction_id: number; short_name: string }[] =
    (selectedAlignmentJob?.params?.reactions as
      | { reaction_id: number; short_name: string }[]
      | undefined) ?? [];

  function resetState() {
    setCurrentStep(0);
    setName('');
    setNotes('');
    setSelectedAlignmentJobId(null);
    setSamples([]);
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
    setSamples([]);
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
        const bwOutputs = alignmentOutputs ?? [];
        const newSamples = alignmentReactions
          .filter((r) => !r.short_name.toLowerCase().includes('igg'))
          .map((r) => ({
            reactionId: r.reaction_id,
            shortName: r.short_name,
            label: r.short_name,
            bigwigPath: resolveReactionBigwig(r.reaction_id, bwOutputs),
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
    return createJobMutation.isPending;
  }

  async function handleSubmit() {
    if (isSubmitDisabled()) return;
    setSubmitError(null);

    try {
      const params: Record<string, unknown> = {
        experiment_id: experiment.id,
        project_id: experiment.projectId,
        parent_job_id: selectedAlignmentJobId,
        alignment_job_id: selectedAlignmentJobId,
        reference_genome: 'mm10',
        samples: samples.map((s) => ({
          reaction_id: s.reactionId,
          short_name: s.shortName,
          label: s.label,
          bigwig_path: s.bigwigPath,
        })),
      };

      const job = await createJobMutation.mutateAsync({
        experimentId: experiment.id,
        payload: {
          jobType: 'roman_normalization',
          name: name.trim(),
          notes: notes.trim() || null,
          params,
          parentJobId: selectedAlignmentJobId,
        },
      });
      toast.success('Normalization job queued');
      handleClose();
      navigate(`/experiments/${experiment.id}/normalization/${job.id}`);
    } catch {
      setSubmitError('Failed to create normalization job. Please try again.');
    }
  }

  // --- Step content ---

  const detailsStep = (
    <div className="grid gap-6 md:grid-cols-2">
      <Card>
        <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
          Normalization Details
        </h3>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Normalization Name <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, 30))}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="e.g., H3K4me3 Roman normalization"
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
            <h4 className="font-medium text-gray-800">What is Roman Normalization?</h4>
            <p>
              Roman normalization is a 99th-percentile quantile normalization method for
              sample-to-sample bigWig signal comparison. It removes technical variation
              between samples so biological differences can be accurately compared in IGV.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-800">What Does the Pipeline Do?</h4>
            <p>
              BigWig signal is extracted at 50 bp resolution across all mouse autosomes
              (chr1{'\u2013'}19) and chrX. Genomic bins with zero coverage and manually curated
              masked regions are excluded. The 99th percentile of signal is computed for
              each sample, and normalization factors are derived relative to the first
              sample (reference). Each sample&apos;s bigWig scores are divided by its
              normalization factor.
            </p>
          </div>
          <div>
            <h4 className="font-medium text-gray-800">Outputs</h4>
            <p>
              Per-sample normalized bigWig files (*_rnorm.bw), normalization factors CSV,
              normalization factors visualization, and pipeline logs.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );

  const alignmentStep = jobsLoading ? (
    <div className="flex h-40 items-center justify-center">
      <Spinner size="lg" />
    </div>
  ) : (
    <Card>
      <h3 className="mb-4 text-sm font-semibold uppercase text-gray-500">
        Select an Alignment Run
      </h3>
      {alignmentJobs.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">
          No completed mouse (mm10) alignment runs available. Roman normalization requires
          mouse data.
        </p>
      ) : (
        <div className="space-y-2">
          {alignmentJobs.map((job: AnalysisJob) => (
            <label
              key={job.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                selectedAlignmentJobId === job.id
                  ? 'border-primary bg-primary/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="alignment"
                checked={selectedAlignmentJobId === job.id}
                onChange={() => handleSelectAlignment(job.id)}
                className="text-primary"
              />
              <div className="flex-1">
                <span className="font-medium text-gray-800">{job.name}</span>
                <span className="ml-3 text-xs text-gray-400">
                  {new Date(job.createdAt).toLocaleDateString()}
                </span>
              </div>
            </label>
          ))}
        </div>
      )}
    </Card>
  );

  const steps = [
    { label: 'Details', content: detailsStep },
    { label: 'Choose Alignment', content: alignmentStep },
    {
      label: 'Select Samples',
      content: (
        <NormalizationSelectSamplesStep
          reactions={alignmentReactions}
          alignmentOutputs={alignmentOutputs ?? []}
          samples={samples}
          setSamples={setSamples}
        />
      ),
    },
    {
      label: 'Settings',
      content: (
        <NormalizationSettingsStep
          genome="mm10"
          samples={samples}
        />
      ),
    },
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Normalization"
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={handleSubmit}
      submitLabel="Start Normalization"
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
                  {createJobMutation.isPending ? 'Starting...' : 'Start Normalization'}
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
