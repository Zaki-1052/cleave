// frontend/src/components/landing/hooks/useElapsedSeconds.ts — ticking clock for the
// live specimen card. 1 Hz setState in a small leaf component is deliberately fine
// (contrast: per-frame values must use ref mutation). Frozen under reduced motion.
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export function useElapsedSeconds(initialSeconds: number): number {
  const reduced = usePrefersReducedMotion();
  const [elapsed, setElapsed] = useState(initialSeconds);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [reduced]);

  return elapsed;
}
