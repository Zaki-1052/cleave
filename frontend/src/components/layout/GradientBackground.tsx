// frontend/src/components/layout/GradientBackground.tsx
import type { ReactNode } from 'react';

export function GradientBackground({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen"
      style={{ background: 'var(--gradient-bg)' }}
    >
      {children}
    </div>
  );
}
