// frontend/src/pages/experiment/PlaceholderTab.tsx
import { Construction } from 'lucide-react';
import { Card } from '@/components/layout/Card';

interface PlaceholderTabProps {
  label: string;
}

export default function PlaceholderTab({ label }: PlaceholderTabProps) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <Construction className="h-10 w-10 text-muted-foreground/50" />
        <h3 className="font-display text-lg font-semibold text-foreground">
          {label}
        </h3>
        <p className="max-w-md text-sm text-muted-foreground">
          This feature is under development and will be available in a future update.
        </p>
      </div>
    </Card>
  );
}
