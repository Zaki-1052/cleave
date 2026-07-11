// frontend/src/components/landing/hooks/useScrolledPast.ts — true once the page has
// scrolled beyond a pixel threshold (drives the nav's transparent→paper transition).
// Boolean state means React bails out of re-renders while the value is unchanged, so a
// passive listener with no throttle is fine here.
import { useEffect, useState } from 'react';

export function useScrolledPast(thresholdPx: number): boolean {
  const [past, setPast] = useState<boolean>(
    () => typeof window !== 'undefined' && window.scrollY > thresholdPx,
  );

  useEffect(() => {
    const onScroll = (): void => setPast(window.scrollY > thresholdPx);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [thresholdPx]);

  return past;
}
