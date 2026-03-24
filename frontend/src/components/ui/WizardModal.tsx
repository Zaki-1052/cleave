// frontend/src/components/ui/WizardModal.tsx
import type { ReactNode } from 'react';
import { Button } from './Button';

interface WizardStep {
  label: string;
  content: ReactNode;
}

interface WizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  steps: WizardStep[];
  currentStep: number;
  onNext: () => void;
  onBack: () => void;
  onSubmit: () => void;
  submitLabel?: string;
}

export function WizardModal({
  isOpen,
  onClose,
  title,
  steps,
  currentStep,
  onNext,
  onBack,
  onSubmit,
  submitLabel = 'Submit',
}: WizardModalProps) {
  if (!isOpen) return null;

  const isLastStep = currentStep === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex h-[80vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b bg-primary px-6 py-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200">
            ✕
          </button>
        </div>

        <div className="flex items-center justify-center gap-4 border-b px-6 py-4">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                  i === currentStep
                    ? 'bg-primary text-white'
                    : i < currentStep
                      ? 'bg-status-complete text-white'
                      : 'bg-gray-200 text-gray-500'
                }`}
              >
                {i + 1}
              </span>
              <span className={`text-sm ${i === currentStep ? 'font-semibold' : 'text-gray-500'}`}>
                {step.label}
              </span>
              {i < steps.length - 1 && <div className="h-px w-8 bg-gray-300" />}
            </div>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">{steps[currentStep]?.content}</div>

        <div className="flex items-center justify-between border-t px-6 py-4">
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            Cancel
          </button>
          <div className="flex gap-3">
            {currentStep > 0 && (
              <Button variant="outlined" onClick={onBack}>
                Back
              </Button>
            )}
            {isLastStep ? (
              <Button onClick={onSubmit}>{submitLabel}</Button>
            ) : (
              <Button onClick={onNext}>Next</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
