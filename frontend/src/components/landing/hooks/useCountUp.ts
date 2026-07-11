// frontend/src/components/landing/hooks/useCountUp.ts — rAF count-up with an ease-out
// cubic, started by a one-shot trigger (useInViewOnce). The rAF id is captured and
// canceled in the effect cleanup — the classic version of this hook leaks the chain on
// unmount/StrictMode remount. Reduced motion jumps straight to the target.
import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

export function useCountUp(target: number, active: boolean, durationMs = 1600): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setValue(target);
      return;
    }
    let rafId = 0;
    let start: number | null = null;
    const step = (ts: number): void => {
      if (start === null) start = ts;
      const t = Math.min((ts - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [active, reduced, target, durationMs]);

  return value;
}
