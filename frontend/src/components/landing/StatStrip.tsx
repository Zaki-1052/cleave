// frontend/src/components/landing/StatStrip.tsx — the hero's stat band: four figures
// that count up (rAF, ease-out cubic) the first time the strip scrolls into view, each
// carrying a small hue tick. tabular-nums keeps the digits from jittering mid-count.
import { cn } from '@/lib/cn';
import { hueAt } from './theme';
import { useCountUp } from './hooks/useCountUp';
import { useInViewOnce } from './hooks/useInViewOnce';

export interface LandingStat {
  value: number;
  suffix?: string;
  label: string;
}

function StatCounter({
  stat,
  active,
  hueIndex,
}: {
  stat: LandingStat;
  active: boolean;
  hueIndex: number;
}) {
  const value = useCountUp(stat.value, active);
  const hue = hueAt(hueIndex);
  return (
    <div>
      <span className={cn('mb-3 block h-0.5 w-8 rounded-full', hue.bg)} />
      <p className="font-mono text-2xl font-medium tabular-nums text-foreground">
        {value}
        {stat.suffix}
      </p>
      <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
        {stat.label}
      </p>
    </div>
  );
}

export function StatStrip({ stats }: { stats: readonly LandingStat[] }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>({ threshold: 0.3 });
  return (
    <div ref={ref} className="border-y border-border/70 bg-background/40">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-2 px-6 md:grid-cols-4">
        {stats.map((stat, i) => (
          <div
            key={stat.label}
            className={cn('py-6 md:py-7', i > 0 && 'md:border-l md:border-border/70 md:pl-8')}
          >
            <StatCounter stat={stat} active={inView} hueIndex={i} />
          </div>
        ))}
      </div>
    </div>
  );
}
