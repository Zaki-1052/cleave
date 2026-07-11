// frontend/src/components/ui/TrainingHint.tsx
import { Lightbulb } from 'lucide-react';

interface TrainingHintProps {
  children: React.ReactNode;
  visible: boolean;
}

/** Educational callout shown only in training project mode. */
export function TrainingHint({ children, visible }: TrainingHintProps) {
  if (!visible) return null;
  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-info/25 bg-info/10 px-3 py-2">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-info" />
      <p className="text-xs leading-relaxed text-foreground/80">{children}</p>
    </div>
  );
}
