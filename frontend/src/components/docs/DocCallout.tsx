// frontend/src/components/docs/DocCallout.tsx
import { Info, AlertTriangle, Lightbulb } from 'lucide-react';

const VARIANTS = {
  note: { icon: Info, border: 'border-primary/30', bg: 'bg-primary/5', iconColor: 'text-primary' },
  warning: { icon: AlertTriangle, border: 'border-yellow-500/30', bg: 'bg-yellow-500/5', iconColor: 'text-yellow-500' },
  tip: { icon: Lightbulb, border: 'border-accent-teal/30', bg: 'bg-accent-teal/5', iconColor: 'text-accent-teal' },
} as const;

interface DocCalloutProps {
  variant: 'note' | 'warning' | 'tip';
  text: string;
}

export function DocCallout({ variant, text }: DocCalloutProps) {
  const v = VARIANTS[variant];
  const Icon = v.icon;
  return (
    <div className={`my-4 flex gap-3 rounded-lg border ${v.border} ${v.bg} p-4`}>
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${v.iconColor}`} />
      <p className="text-sm text-foreground" dangerouslySetInnerHTML={{ __html: text }} />
    </div>
  );
}
