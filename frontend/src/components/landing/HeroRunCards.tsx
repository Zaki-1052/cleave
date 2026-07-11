// frontend/src/components/landing/HeroRunCards.tsx — the hero's "pinned specimens":
// two run cards pinned at slight angles that level and lift on hover. The live card's
// elapsed clock ticks at 1 Hz and the same value derives the progress-bar width (one
// data source; transition-[width] smooths each step). Flanks the wordmark at lg+;
// renders as a 2-up strip below the CTAs on smaller screens. Decorative → aria-hidden.
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Eyebrow } from './SectionHeader';
import { useElapsedSeconds } from './hooks/useElapsedSeconds';

const LIVE_START_S = 2537; // 00:42:17 on first paint

function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function SpecimenCard({
  rotateClass,
  className,
  delayMs,
  children,
}: {
  rotateClass: string;
  className?: string;
  delayMs: number;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'pointer-events-auto relative animate-fade-rise rounded-lg border border-border bg-card p-4 shadow-md transition-all duration-300 ease-emphasized hover:-translate-y-1.5 hover:rotate-0 hover:shadow-lg',
        rotateClass,
        className,
      )}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      {/* The pin */}
      <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-primary shadow-sm ring-4 ring-primary/20" />
      {children}
    </div>
  );
}

export function HeroRunCards() {
  const elapsed = useElapsedSeconds(LIVE_START_S);
  const progressPct = Math.min(94, 66 + (elapsed - LIVE_START_S) * 0.08);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none relative z-20 mx-auto mt-12 grid max-w-xl grid-cols-1 gap-5 px-6 pb-16 sm:grid-cols-2 lg:absolute lg:inset-0 lg:mx-0 lg:mt-0 lg:block lg:max-w-none lg:px-0 lg:pb-0"
    >
      {/* Yesterday's run, filed */}
      <SpecimenCard
        rotateClass="-rotate-2"
        delayMs={650}
        className="opacity-90 lg:absolute lg:left-6 lg:top-36 lg:w-64 xl:left-14 xl:w-72 2xl:left-28"
      >
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>Run 0041 · Alignment</Eyebrow>
          <StatusBadge status="complete" />
        </div>
        <div className="mt-3 flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
          <span>24 reactions</span>
          <span>03:12:44</span>
        </div>
      </SpecimenCard>

      {/* Today's run, live */}
      <SpecimenCard
        rotateClass="rotate-[1.5deg]"
        delayMs={800}
        className="lg:absolute lg:right-6 lg:top-56 lg:w-64 xl:right-14 xl:w-72 2xl:right-28"
      >
        <div className="flex items-center justify-between gap-3">
          <Eyebrow>Run 0042 · Peak Calling</Eyebrow>
          <StatusBadge status="running" />
        </div>
        <dl className="mt-4 space-y-2 font-mono text-xs tabular-nums">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Reactions</dt>
            <dd className="text-foreground">24</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Stage</dt>
            <dd className="text-foreground">04 / 06</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Elapsed</dt>
            <dd className="text-foreground">{formatClock(elapsed)}</dd>
          </div>
        </dl>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-1000 ease-linear"
            style={{ width: `${progressPct.toFixed(2)}%` }}
          />
        </div>
      </SpecimenCard>
    </div>
  );
}
