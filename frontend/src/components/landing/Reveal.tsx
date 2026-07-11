// frontend/src/components/landing/Reveal.tsx — one-shot scroll reveal wrapper. Content
// stays in the DOM/accessibility tree (opacity + transform only) and settles the first
// time it enters the viewport; under reduced motion useInViewOnce reports true
// immediately, so it renders settled with no movement.
import type { CSSProperties, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useInViewOnce } from './hooks/useInViewOnce';

type RevealDirection = 'up' | 'left' | 'right';

const HIDDEN: Record<RevealDirection, string> = {
  up: 'translate-y-7',
  left: '-translate-x-9',
  right: 'translate-x-9',
};

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Transition delay in ms — used for stagger; travels via inline style, not a class. */
  delay?: number;
  direction?: RevealDirection;
  threshold?: number;
}

export function Reveal({ children, className, delay = 0, direction = 'up', threshold }: RevealProps) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>({ threshold: threshold ?? 0.12 });
  return (
    <div
      ref={ref}
      className={cn(
        'transition-[opacity,transform] duration-700 ease-emphasized',
        inView ? 'translate-x-0 translate-y-0 opacity-100' : cn('opacity-0', HIDDEN[direction]),
        className,
      )}
      style={delay > 0 ? ({ transitionDelay: `${delay}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}
