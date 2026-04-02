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
    <div className="mt-2 flex items-start gap-2 rounded-md border border-teal-200 bg-teal-50 px-3 py-2 dark:border-teal-800 dark:bg-teal-950">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-teal-600 dark:text-teal-400" />
      <p className="text-xs leading-relaxed text-teal-700 dark:text-teal-300">{children}</p>
    </div>
  );
}
