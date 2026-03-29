// frontend/src/components/ui/WizardModal.tsx
import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog';
import { Button } from './Button';
import { cn } from '@/lib/cn';

interface WizardStep {
  label: string;
  content: ReactNode;
}

interface FooterRenderArgs {
  currentStep: number;
  isLastStep: boolean;
  onClose: () => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
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
  maxWidth?: string;
  renderFooter?: (args: FooterRenderArgs) => ReactNode;
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
  maxWidth = 'max-w-4xl',
  renderFooter,
}: WizardModalProps) {
  const isLastStep = currentStep === steps.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className={cn(
          'flex h-[80vh] flex-col gap-0 overflow-hidden p-0 [&>button]:text-white [&>button]:hover:opacity-100',
          maxWidth,
        )}
      >
        {/* Accessible title for screen readers */}
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{title} wizard</DialogDescription>

        {/* Primary-colored header */}
        <div className="flex shrink-0 items-center justify-between border-b bg-primary px-6 py-4">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
        </div>

        {/* Step indicators */}
        <div className="flex shrink-0 items-center justify-center gap-4 border-b px-6 py-4">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold',
                  i === currentStep
                    ? 'bg-primary text-white'
                    : i < currentStep
                      ? 'bg-status-complete text-white'
                      : 'bg-gray-200 text-gray-500',
                )}
              >
                {i < currentStep ? (
                  <Check className="h-4 w-4" />
                ) : (
                  i + 1
                )}
              </span>
              <span className={cn('text-sm', i === currentStep ? 'font-semibold' : 'text-gray-500')}>
                {step.label}
              </span>
              {i < steps.length - 1 && <div className="h-px w-8 bg-gray-300" />}
            </div>
          ))}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">{steps[currentStep]?.content}</div>

        {/* Footer */}
        {renderFooter ? (
          renderFooter({ currentStep, isLastStep, onClose, onBack, onNext, onSubmit })
        ) : (
          <div className="flex shrink-0 items-center justify-between border-t px-6 py-4">
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
        )}
      </DialogContent>
    </Dialog>
  );
}
