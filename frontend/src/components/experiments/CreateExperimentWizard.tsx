// frontend/src/components/experiments/CreateExperimentWizard.tsx
import { useState } from 'react';
import { toast } from 'sonner';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { ExperimentDetailsStep } from './ExperimentDetailsStep';
import { AutoPipelineStep } from './AutoPipelineStep';
import { FileUploadZone } from '@/components/fastqs/FileUploadZone';
import { ReactionsEditor } from '@/components/reactions/ReactionsEditor';
import { useCreateExperiment, useUpdateExperiment } from '@/hooks/useExperiments';
import { startAutoPipeline, type AutoPipelineConfig } from '@/api/autoPipeline';
import type { Experiment } from '@/api/types';

interface CreateExperimentWizardProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  isTrainingProject?: boolean;
  onCreated: (experiment: Experiment) => void;
}

export function CreateExperimentWizard({
  isOpen,
  onClose,
  projectId,
  isTrainingProject = false,
  onCreated,
}: CreateExperimentWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState('');
  const [assayType, setAssayType] = useState('CUT&RUN');
  const [description, setDescription] = useState('');
  const [createdExperiment, setCreatedExperiment] = useState<Experiment | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Auto-pipeline config state
  const [autoPipelineEnabled, setAutoPipelineEnabled] = useState(false);
  const [referenceGenome, setReferenceGenome] = useState('mm10');
  const [peakCaller, setPeakCaller] = useState('SEACR');
  const [peakSize, setPeakSize] = useState('stringent');
  const [includeNormalization, setIncludeNormalization] = useState(true);
  const [includeDiffbind, setIncludeDiffbind] = useState(true);
  const [includeHeatmap, setIncludeHeatmap] = useState(true);
  const [includePearson, setIncludePearson] = useState(true);
  const [pipelineSubmitting, setPipelineSubmitting] = useState(false);

  const createExperiment = useCreateExperiment();
  const updateExperiment = useUpdateExperiment();

  function resetState() {
    setCurrentStep(0);
    setName('');
    setAssayType('');
    setDescription('');
    setCreatedExperiment(null);
    setCreateError(null);
    setAutoPipelineEnabled(false);
    setReferenceGenome('');
    setPeakCaller('SEACR');
    setPeakSize('stringent');
    setIncludeNormalization(true);
    setIncludeDiffbind(true);
    setIncludeHeatmap(true);
    setIncludePearson(true);
    setPipelineSubmitting(false);
    createExperiment.reset();
    updateExperiment.reset();
  }

  function handleClose() {
    resetState();
    onClose();
  }

  async function handleNext() {
    if (currentStep === 0) {
      if (!name.trim() || !assayType) return;
      setCreateError(null);

      try {
        if (createdExperiment) {
          // User went back and may have edited details — update
          const updated = await updateExperiment.mutateAsync({
            id: createdExperiment.id,
            updates: {
              name: name.trim(),
              assayType,
              description: description.trim() || undefined,
            },
          });
          setCreatedExperiment(updated);
        } else {
          // First time — create the experiment
          const experiment = await createExperiment.mutateAsync({
            projectId,
            name: name.trim(),
            assayType,
            description: description.trim() || undefined,
          });
          setCreatedExperiment(experiment);
        }
        setCurrentStep(1);
      } catch {
        setCreateError('Failed to create experiment. Please try again.');
      }
      return;
    }

    const maxStep = isTrainingProject ? 2 : 3;
    if (currentStep < maxStep) {
      setCurrentStep((prev) => prev + 1);
    }
  }

  function handleBack() {
    setCurrentStep((prev) => Math.max(0, prev - 1));
  }

  function handleSave() {
    handleClose();
  }

  function handleUpdateExperiment() {
    if (createdExperiment) {
      onCreated(createdExperiment);
    }
    resetState();
  }

  async function handleFinish() {
    if (autoPipelineEnabled && createdExperiment) {
      setPipelineSubmitting(true);
      try {
        const isRnaseq = assayType === 'RNA-seq';
        const config: AutoPipelineConfig = isRnaseq
          ? {
              referenceGenome,
              removeDuplicates: false,
              includeDe: true,
            }
          : {
              referenceGenome,
              peakCaller,
              peakSize,
              macs2Qvalue: 0.01,
              fragmentFilter: true,
              includeNormalization: referenceGenome === 'mm10' && includeNormalization,
              includeDiffbind,
              includeHeatmap,
              includePearson,
            };
        await startAutoPipeline(createdExperiment.id, config);
      } catch {
        toast.error('Failed to start auto-pipeline. You can start it from the experiment page.');
      } finally {
        setPipelineSubmitting(false);
      }
    }
    if (createdExperiment) {
      onCreated(createdExperiment);
    }
    resetState();
  }

  const isPending = createExperiment.isPending || updateExperiment.isPending;

  const steps = [
    {
      label: 'Details',
      content: (
        <ExperimentDetailsStep
          name={name}
          setName={setName}
          assayType={assayType}
          setAssayType={setAssayType}
          description={description}
          setDescription={setDescription}
          error={createError}
        />
      ),
    },
    {
      label: 'FASTQs',
      content: createdExperiment ? (
        <FileUploadZone
          experimentId={createdExperiment.id}
          onUploadComplete={() => {}}
        />
      ) : null,
    },
    {
      label: 'Reactions',
      content: createdExperiment ? (
        <ReactionsEditor
          experimentId={createdExperiment.id}
          assayType={createdExperiment.assayType}
        />
      ) : null,
    },
    // Pipeline step hidden for training projects
    ...(!isTrainingProject
      ? [
          {
            label: 'Pipeline',
            content: createdExperiment ? (
              <AutoPipelineStep
                experimentId={createdExperiment.id}
                assayType={assayType}
                enabled={autoPipelineEnabled}
                setEnabled={setAutoPipelineEnabled}
                referenceGenome={referenceGenome}
                setReferenceGenome={setReferenceGenome}
                peakCaller={peakCaller}
                setPeakCaller={setPeakCaller}
                peakSize={peakSize}
                setPeakSize={setPeakSize}
                includeNormalization={includeNormalization}
                setIncludeNormalization={setIncludeNormalization}
                includeDiffbind={includeDiffbind}
                setIncludeDiffbind={setIncludeDiffbind}
                includeHeatmap={includeHeatmap}
                setIncludeHeatmap={setIncludeHeatmap}
                includePearson={includePearson}
                setIncludePearson={setIncludePearson}
              />
            ) : null,
          },
        ]
      : []),
  ];

  return (
    <WizardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="New Experiment"
      steps={steps}
      currentStep={currentStep}
      onNext={handleNext}
      onBack={handleBack}
      onSubmit={autoPipelineEnabled ? handleFinish : handleUpdateExperiment}
      submitLabel={autoPipelineEnabled ? 'Create & Run Pipeline' : 'Update Experiment'}
      maxWidth="max-w-6xl"
      renderFooter={({ currentStep: step, isLastStep, onClose: close, onBack: back }) => (
        <div className="flex items-center justify-between border-t px-6 py-4">
          <button onClick={close} className="text-sm text-muted-foreground hover:text-foreground">
            Cancel
          </button>
          <div className="flex gap-3">
            {step > 0 && (
              <Button variant="outlined" onClick={back}>
                Back
              </Button>
            )}
            {isLastStep ? (
              <>
                <Button variant="outlined" onClick={handleSave}>
                  Save
                </Button>
                {autoPipelineEnabled ? (
                  <Button
                    onClick={handleFinish}
                    disabled={!referenceGenome || pipelineSubmitting}
                  >
                    {pipelineSubmitting ? 'Starting Pipeline...' : 'Create & Run Pipeline'}
                  </Button>
                ) : (
                  <Button onClick={handleUpdateExperiment}>
                    Update Experiment
                  </Button>
                )}
              </>
            ) : (
              <Button
                onClick={handleNext}
                disabled={step === 0 && (!name.trim() || !assayType || isPending)}
              >
                {step === 0 && isPending ? 'Creating...' : 'Next'}
              </Button>
            )}
          </div>
        </div>
      )}
    />
  );
}
