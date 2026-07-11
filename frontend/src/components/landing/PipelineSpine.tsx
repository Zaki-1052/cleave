// frontend/src/components/landing/PipelineSpine.tsx — the protocol as a vertical
// timeline: a spine that draws itself in step with scroll (useScrollSpine), hue-coded
// stage nodes that light as their card reveals, cards alternating sides at lg+, and an
// ember pulse on the final (live) node. Spine geometry: the SVG's viewBox is 2×100 with
// preserveAspectRatio="none", so getTotalLength() is a constant 100 regardless of the
// rendered height — no resize handling needed.
import { cn } from '@/lib/cn';
import { hueAt } from './theme';
import { SectionHeader } from './SectionHeader';
import { useInViewOnce } from './hooks/useInViewOnce';
import { useScrollSpine } from './hooks/useScrollSpine';

export interface PipelineStage {
  index: string;
  title: string;
  desc: string;
}

function StageRow({ stage, i, last }: { stage: PipelineStage; i: number; last: boolean }) {
  const { ref, inView } = useInViewOnce<HTMLDivElement>({ threshold: 0.35 });
  const hue = hueAt(i);
  const cardLeft = i % 2 === 0;
  return (
    <div ref={ref} className="grid grid-cols-[2rem_1fr] gap-x-4 lg:grid-cols-[1fr_3.5rem_1fr] lg:gap-x-0">
      {/* Node on the spine */}
      <div className="col-start-1 row-start-1 flex justify-center pt-6 lg:col-start-2">
        <span
          className={cn(
            'relative z-10 block h-3.5 w-3.5 rounded-full border-2 transition-colors duration-500',
            inView
              ? last
                ? 'border-transparent bg-ember shadow-[0_0_6px_hsl(var(--ember)/0.7)]'
                : cn('border-transparent', hue.bg)
              : 'border-border bg-background',
          )}
        >
          {last && inView && (
            <span className="absolute inset-0 rounded-full bg-ember/40 animate-ping [animation-duration:2.6s]" />
          )}
        </span>
      </div>
      {/* Stage card */}
      <div
        className={cn(
          'col-start-2 row-start-1 transition-[opacity,transform] duration-700 ease-emphasized',
          cardLeft ? 'lg:col-start-1 lg:pr-2' : 'lg:col-start-3 lg:pl-2',
          inView
            ? 'translate-x-0 opacity-100'
            : cn('opacity-0', cardLeft ? '-translate-x-8' : 'translate-x-8'),
        )}
      >
        <div className="rounded-lg border border-border bg-card p-5 shadow-sm dark:shadow-none">
          <span className={cn('font-mono text-xs font-medium', hue.text)}>{stage.index}</span>
          <h3 className="mt-1.5 font-display text-lg font-semibold text-foreground">
            {stage.title}
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{stage.desc}</p>
        </div>
      </div>
    </div>
  );
}

interface PipelineSpineProps {
  stages: readonly PipelineStage[];
  index?: string;
  eyebrow: string;
  title: React.ReactNode;
  lede?: string;
}

export function PipelineSpine({ stages, index, eyebrow, title, lede }: PipelineSpineProps) {
  const { sectionRef, pathRef } = useScrollSpine<HTMLDivElement>();
  return (
    <section id="pipeline" className="scroll-mt-16">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <SectionHeader index={index} eyebrow={eyebrow} title={title} lede={lede} />
        <div ref={sectionRef} className="relative mt-14">
          <svg
            className="absolute left-4 top-0 h-full w-0.5 -translate-x-1/2 lg:left-1/2"
            viewBox="0 0 2 100"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
          >
            <path d="M1 0 L1 100" className="stroke-border" strokeWidth={2} />
            <path ref={pathRef} d="M1 0 L1 100" className="stroke-primary" strokeWidth={2} />
          </svg>
          <ol className="space-y-8">
            {stages.map((stage, i) => (
              <li key={stage.index}>
                <StageRow stage={stage} i={i} last={i === stages.length - 1} />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
