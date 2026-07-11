// frontend/src/components/landing/hooks/usePrefersReducedMotion.ts — the master motion
// gate for the landing page. JS-driven motion (rAF, parallax, SMIL children) must check
// this; CSS keyframes get a belt-and-suspenders media query in index.css. Note: CSS
// media queries cannot pause SMIL, so <animate>/<animateMotion> must be conditionally
// rendered based on this hook.
import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(QUERY).matches
      : false,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent): void => setReduced(event.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
