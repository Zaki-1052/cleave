// frontend/src/components/landing/hooks/useDrawOnMount.ts — one-shot "draw this SVG
// path" on mount via a stroke-dashoffset transition (seismograph trace, hero underline).
// getTotalLength() runs in useLayoutEffect (before paint, after the ref exists); lengths
// are in viewBox units, so no resize recompute is needed. The dasharray is padded by 1
// and the final offset clamped to 0 — Safari's path-length precision can otherwise leave
// a hairline sliver at the "fully hidden" end.
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface DrawOptions {
  delayMs?: number;
  durationMs?: number;
}

export function useDrawOnMount(options?: DrawOptions): RefObject<SVGPathElement> {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<SVGPathElement>(null);
  const delayMs = options?.delayMs ?? 0;
  const durationMs = options?.durationMs ?? 1400;

  useLayoutEffect(() => {
    const path = ref.current;
    if (!path) return;
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return;

    if (reduced) {
      path.style.strokeDasharray = 'none';
      path.style.strokeDashoffset = '0';
      return;
    }

    const padded = length + 1;
    path.style.transition = 'none';
    path.style.strokeDasharray = `${padded}`;
    path.style.strokeDashoffset = `${padded}`;
    // Commit the hidden state before enabling the transition, else it never animates.
    path.getBoundingClientRect();
    const rafId = requestAnimationFrame(() => {
      path.style.transition = `stroke-dashoffset ${durationMs}ms cubic-bezier(0.32, 0.72, 0, 1) ${delayMs}ms`;
      path.style.strokeDashoffset = '0';
    });
    return () => cancelAnimationFrame(rafId);
  }, [reduced, delayMs, durationMs]);

  return ref;
}
