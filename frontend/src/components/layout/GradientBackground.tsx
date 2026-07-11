// frontend/src/components/layout/GradientBackground.tsx — the app's quiet paper surface:
// warm base, two barely-there radial tints (viridian / ember), fine grain. Replaces the
// old five-stop gradient; the export name is kept for its existing consumers.
import type { ReactNode } from 'react';

export function GradientBackground({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            'radial-gradient(1200px 800px at 85% -10%, hsl(var(--surface-tint-1) / 0.07), transparent 60%), radial-gradient(1000px 700px at -10% 110%, hsl(var(--surface-tint-2) / 0.05), transparent 60%)',
        }}
      />
      <div aria-hidden="true" className="bg-grain pointer-events-none fixed inset-0 opacity-[0.025]" />
      <div className="relative">{children}</div>
    </div>
  );
}
