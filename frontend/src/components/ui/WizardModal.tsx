// frontend/src/components/ui/WizardModal.tsx — multi-step creation flow. Outside clicks
// are guarded (a stray click must never discard accumulated wizard state); Esc and the
// close button remain as deliberate exits.
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
        className={cn('flex h-[80vh] flex-col gap-0 overflow-hidden p-0', maxWidth)}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{title} wizard</DialogDescription>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <h2 className="font-display text-xl font-semibold text-foreground">{title}</h2>
        </div>

        {/* Step indicator — specimen-label voice: mono index, quiet connectors */}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-y-1 border-b border-border px-6 py-3">
          {steps.map((step, i) => {
            const isCurrent = i === currentStep;
            const isDone = i < currentStep;
            return (
              <div key={i} className="flex items-center">
                <div
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2.5 py-1.5 transition-colors duration-150',
                    isCurrent
                      ? 'bg-accent text-accent-foreground'
                      : isDone
                        ? 'text-primary'
                        : 'text-muted-foreground',
                  )}
                >
                  <span className="font-mono text-[11px] tracking-wide">
                    {isDone ? <Check className="h-3.5 w-3.5" /> : String(i + 1).padStart(2, '0')}
                  </span>
                  <span className={cn('text-xs', isCurrent ? 'font-semibold' : 'font-medium')}>
                    {step.label}
                  </span>
                </div>
                {i < steps.length - 1 && <div className="mx-1.5 h-px w-6 bg-border" />}
              </div>
            );
          })}
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-y-auto p-6">{steps[currentStep]?.content}</div>

        {/* Footer */}
        {renderFooter ? (
          renderFooter({ currentStep, isLastStep, onClose, onBack, onNext, onSubmit })
        ) : (
          <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-4">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <div className="flex gap-3">
              {currentStep > 0 && (
                <Button variant="outline" onClick={onBack}>
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
