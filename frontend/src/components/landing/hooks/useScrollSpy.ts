// frontend/src/components/landing/hooks/useScrollSpy.ts — reports which section id is
// most visible, for highlighting the active nav anchor. Callers must pass a module-level
// constant array (a fresh literal each render would resubscribe the observer every time).
import { useEffect, useState } from 'react';

export function useScrollSpy(sectionIds: readonly string[]): string | null {
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (elements.length === 0) return;

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio);
          else visible.delete(entry.target.id);
        }
        let best: string | null = null;
        let bestRatio = 0;
        for (const [id, ratio] of visible) {
          if (ratio >= bestRatio) {
            best = id;
            bestRatio = ratio;
          }
        }
        // Keep the previous highlight while between sections rather than flickering off.
        if (best !== null) setActive(best);
      },
      { rootMargin: '-15% 0px -50% 0px', threshold: [0, 0.2, 0.5] },
    );
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sectionIds]);

  return active;
}
