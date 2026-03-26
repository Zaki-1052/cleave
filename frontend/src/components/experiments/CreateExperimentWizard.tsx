// frontend/src/components/experiments/CreateExperimentWizard.tsx
import { useState } from 'react';
import { WizardModal } from '@/components/ui/WizardModal';
import { Button } from '@/components/ui/Button';
import { ExperimentDetailsStep } from './ExperimentDetailsStep';
import { FileUploadZone } from '@/components/fastqs/FileUploadZone';
import { ReactionsEditor } from '@/components/reactions/ReactionsEditor';
import { useCreateExperiment, useUpdateExperiment } from '@/hooks/useExperiments';
import type { Experiment } from '@/api/types';

interface CreateExperimentWizardProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: number;
  onCreated: (experiment: Experiment) => void;
}

export function CreateExperimentWizard({
  isOpen,
  onClose,
  projectId,
  onCreated,
}: CreateExperimentWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState('');
  const [assayType, setAssayType] = useState('');
  const [description, setDescription] = useState('');
  const [createdExperiment, setCreatedExperiment] = useState<Experiment | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const createExperiment = useCreateExperiment();
  const updateExperiment = useUpdateExperiment();

  function resetState() {
    setCurrentStep(0);
    setName('');
    setAssayType('');
    setDescription('');
    setCreatedExperiment(null);
    setCreateError(null);
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

    if (currentStep === 1) {
      setCurrentStep(2);
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
      onSubmit={handleUpdateExperiment}
      submitLabel="Update Experiment"
      maxWidth="max-w-6xl"
      renderFooter={({ currentStep: step, isLastStep, onClose: close, onBack: back }) => (
        <div className="flex items-center justify-between border-t px-6 py-4">
          <button onClick={close} className="text-sm text-gray-500 hover:text-gray-700">
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
                <Button onClick={handleUpdateExperiment}>
                  Update Experiment
                </Button>
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
