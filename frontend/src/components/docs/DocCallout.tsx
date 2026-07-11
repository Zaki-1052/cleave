// frontend/src/components/docs/DocCallout.tsx
import { Info, AlertTriangle, Lightbulb } from 'lucide-react';

const VARIANTS = {
  note: { icon: Info, border: 'border-info/25', bg: 'bg-info/10', iconColor: 'text-info' },
  warning: { icon: AlertTriangle, border: 'border-warning/25', bg: 'bg-warning/10', iconColor: 'text-warning' },
  tip: { icon: Lightbulb, border: 'border-primary/25', bg: 'bg-primary/10', iconColor: 'text-primary' },
} as const;

interface DocCalloutProps {
  variant: 'note' | 'warning' | 'tip';
  text: string;
}

export function DocCallout({ variant, text }: DocCalloutProps) {
  const v = VARIANTS[variant];
  const Icon = v.icon;
  return (
    <div className={`my-4 flex gap-3 rounded-md border ${v.border} ${v.bg} p-4`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${v.iconColor}`} />
      <p className="text-sm text-foreground/85" dangerouslySetInnerHTML={{ __html: text }} />
    </div>
  );
}
