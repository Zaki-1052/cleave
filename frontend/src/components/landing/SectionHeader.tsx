// frontend/src/components/landing/SectionHeader.tsx — the landing's specimen-label
// section heading: a mono eyebrow (optionally stamped "§ NN" in viridian) over a serif
// title. Shared by the page and PipelineSpine.
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </p>
  );
}

interface SectionHeaderProps {
  eyebrow: string;
  /** Two-digit section stamp rendered as "§ NN" before the eyebrow. */
  index?: string;
  title: ReactNode;
  lede?: string;
  className?: string;
}

export function SectionHeader({ eyebrow, index, title, lede, className }: SectionHeaderProps) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <Eyebrow>
        {index !== undefined && <span className="mr-2 text-primary">§ {index}</span>}
        {eyebrow}
      </Eyebrow>
      <h2 className="mt-2 font-display text-3xl font-semibold text-foreground">{title}</h2>
      {lede !== undefined && (
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">{lede}</p>
      )}
    </div>
  );
}
