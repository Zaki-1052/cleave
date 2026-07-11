// frontend/src/components/landing/hooks/useMouseParallax.ts — three-depth mouse parallax
// for the hero atmosphere. One passive mousemove listener stores coords in a ref; one rAF
// loop lerps toward them and writes translate3d straight onto the three layer elements —
// React never re-renders for this (per-frame setState at page level is the jank pattern
// this replaces). The whole system only runs while the container is on screen (IO-gated)
// and never attaches under reduced motion.
import { useEffect, useRef, type RefObject } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface ParallaxLayers {
  containerRef: RefObject<HTMLDivElement>;
  farRef: RefObject<HTMLDivElement>;
  midRef: RefObject<HTMLDivElement>;
  nearRef: RefObject<HTMLDivElement>;
}

const LERP = 0.06;

export function useMouseParallax(): ParallaxLayers {
  const reduced = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const farRef = useRef<HTMLDivElement>(null);
  const midRef = useRef<HTMLDivElement>(null);
  const nearRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) return;
    const container = containerRef.current;
    if (!container) return;

    const layers: readonly [RefObject<HTMLDivElement>, number][] = [
      [farRef, 0.012],
      [midRef, 0.022],
      [nearRef, 0.034],
    ];
    const pointer = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let rafId = 0;
    let running = false;

    const tick = (): void => {
      current.x += (pointer.x - current.x) * LERP;
      current.y += (pointer.y - current.y) * LERP;
      for (const [layerRef, depth] of layers) {
        const el = layerRef.current;
        if (el) {
          el.style.transform = `translate3d(${(current.x * depth).toFixed(2)}px, ${(current.y * depth).toFixed(2)}px, 0)`;
        }
      }
      if (running) rafId = requestAnimationFrame(tick);
    };
    const onMove = (event: MouseEvent): void => {
      pointer.x = event.clientX - window.innerWidth / 2;
      pointer.y = event.clientY - window.innerHeight / 2;
    };
    const start = (): void => {
      if (running) return;
      running = true;
      window.addEventListener('mousemove', onMove, { passive: true });
      rafId = requestAnimationFrame(tick);
    };
    const stop = (): void => {
      if (!running) return;
      running = false;
      window.removeEventListener('mousemove', onMove);
      cancelAnimationFrame(rafId);
    };

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) start();
      else stop();
    });
    observer.observe(container);
    return () => {
      stop();
      observer.disconnect();
    };
  }, [reduced]);

  return { containerRef, farRef, midRef, nearRef };
}
