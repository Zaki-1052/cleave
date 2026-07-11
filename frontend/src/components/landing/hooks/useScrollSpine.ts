// frontend/src/components/landing/hooks/useScrollSpine.ts — draws the pipeline spine in
// step with scroll. A passive scroll/resize listener schedules one rAF that maps the
// section's bounding rect to a clamped [0,1] progress and writes strokeDashoffset
// directly on the path (no setState per frame). IntersectionObserver gates the listener
// so nothing runs while the section is off screen. IO intersectionRatio itself is NOT
// used as the progress driver — it isn't monotonic with scroll for sections taller than
// the viewport. Under reduced motion the spine renders fully drawn.
import { useLayoutEffect, useRef, type RefObject } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface ScrollSpine<T extends HTMLElement> {
  sectionRef: RefObject<T>;
  pathRef: RefObject<SVGPathElement>;
}

// progress = 0 when the section's top crosses 80% of the viewport height;
// progress = 1 when its bottom reaches 50% — the spine finishes just before the
// last stage card settles. rect.top travels rect.height + (0.8 − 0.5)·viewport
// between those two states, which is the denominator below.
const START_VH = 0.8;
const END_VH = 0.5;

export function useScrollSpine<T extends HTMLElement = HTMLDivElement>(): ScrollSpine<T> {
  const reduced = usePrefersReducedMotion();
  const sectionRef = useRef<T>(null);
  const pathRef = useRef<SVGPathElement>(null);

  useLayoutEffect(() => {
    const section = sectionRef.current;
    const path = pathRef.current;
    if (!section || !path) return;
    const length = path.getTotalLength();
    if (!Number.isFinite(length) || length <= 0) return;

    if (reduced) {
      path.style.strokeDasharray = 'none';
      path.style.strokeDashoffset = '0';
      return;
    }

    const padded = length + 1;
    path.style.strokeDasharray = `${padded}`;
    path.style.strokeDashoffset = `${padded}`;

    let rafId = 0;
    let scheduled = false;
    const update = (): void => {
      scheduled = false;
      const rect = section.getBoundingClientRect();
      const viewport = window.innerHeight;
      const travel = rect.height + viewport * (START_VH - END_VH);
      if (travel <= 0) return;
      const progress = Math.min(1, Math.max(0, (viewport * START_VH - rect.top) / travel));
      const offset = padded * (1 - progress);
      if (Number.isFinite(offset)) {
        path.style.strokeDashoffset = `${Math.max(0, offset)}`;
      }
    };
    const schedule = (): void => {
      if (scheduled) return;
      scheduled = true;
      rafId = requestAnimationFrame(update);
    };

    let listening = false;
    const startListen = (): void => {
      if (listening) return;
      listening = true;
      window.addEventListener('scroll', schedule, { passive: true });
      window.addEventListener('resize', schedule, { passive: true });
      schedule();
    };
    const stopListen = (): void => {
      if (!listening) return;
      listening = false;
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(rafId);
      scheduled = false;
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) startListen();
        else stopListen();
      },
      { rootMargin: '25% 0px 25% 0px' },
    );
    observer.observe(section);
    update();
    return () => {
      stopListen();
      observer.disconnect();
    };
  }, [reduced]);

  return { sectionRef, pathRef };
}
