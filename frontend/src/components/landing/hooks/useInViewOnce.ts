// frontend/src/components/landing/hooks/useInViewOnce.ts — one-shot IntersectionObserver:
// flips to true the first time the element enters the viewport, then disconnects. Under
// prefers-reduced-motion it reports true immediately, so every reveal/count-up consumer
// renders its settled state without needing its own check.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface InViewOptions {
  threshold?: number;
  rootMargin?: string;
}

export function useInViewOnce<T extends Element = HTMLDivElement>(
  options?: InViewOptions,
): { ref: RefObject<T>; inView: boolean } {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const threshold = options?.threshold ?? 0.15;
  const rootMargin = options?.rootMargin;

  useEffect(() => {
    if (reduced) {
      setInView(true);
      return;
    }
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced, threshold, rootMargin]);

  return { ref, inView };
}
