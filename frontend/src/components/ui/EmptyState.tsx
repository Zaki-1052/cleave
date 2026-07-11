// frontend/src/components/ui/EmptyState.tsx — the app's single empty pattern: quiet icon
// well, serif title (an identity moment), optional guidance and action.
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-14 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-accent">
        <Icon className="h-5 w-5 text-primary/80" />
      </div>
      <h3 className="font-display text-lg font-medium text-foreground">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
