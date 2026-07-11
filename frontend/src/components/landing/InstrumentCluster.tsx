// frontend/src/components/landing/InstrumentCluster.tsx — the hero's instruments: a
// mono tick ruler (also echoed in the footer) and a seismograph trace that draws itself
// on load (stroke-dashoffset via useDrawOnMount), with ember event markers fading in
// once the trace lands. Ember = live-signal only, per the system rules.
import { cn } from '@/lib/cn';
import { useDrawOnMount } from './hooks/useDrawOnMount';

export function TimelineRuler({ ticks = 20, className }: { ticks?: number; className?: string }) {
  const marks = Array.from({ length: ticks + 1 }, (_, i) => i);
  return (
    <svg
      viewBox="0 0 1000 28"
      preserveAspectRatio="none"
      className={cn('block h-7 w-full', className)}
      aria-hidden="true"
    >
      <line x1="0" y1="14" x2="1000" y2="14" className="stroke-border" strokeWidth="1" />
      {marks.map((i) => {
        const x = (i / ticks) * 1000;
        const major = i % 5 === 0;
        return (
          <g key={i}>
            <line
              x1={x}
              y1={major ? 5 : 9}
              x2={x}
              y2={14}
              className={major ? 'stroke-muted-foreground/50' : 'stroke-border'}
              strokeWidth={major ? 1 : 0.75}
            />
            {major && (
              <text
                x={x}
                y={25}
                textAnchor={i === 0 ? 'start' : i === ticks ? 'end' : 'middle'}
                fontSize="7"
                className="fill-muted-foreground/60 font-mono"
              >
                {`run ${String(i * 10).padStart(4, '0')}`}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// Hand-authored trace (borrowed shape from the survey): quiet baseline, four peaks.
const TRACE_D =
  'M0 110 C30 108 60 100 90 85 C110 72 125 45 140 30 C150 22 160 18 170 20 C185 25 200 50 230 78 C260 100 300 110 350 112 C380 113 410 108 430 95 C450 78 460 50 475 32 C485 22 495 18 510 16 C525 14 540 22 555 38 C570 55 590 85 630 105 C660 112 700 115 740 110 C760 106 775 80 790 58 C800 44 810 34 820 32 C835 30 850 42 870 68 C885 88 900 108 900 110';
const AREA_D = `${TRACE_D} L900 140 L0 140 Z`;
const EVENTS: readonly [number, number][] = [
  [140, 30],
  [475, 32],
  [510, 16],
  [790, 58],
];

export function Seismograph({ className }: { className?: string }) {
  // The hero reveals this cluster at ~1000ms — start drawing as the wrapper lands.
  const traceRef = useDrawOnMount({ delayMs: 1100, durationMs: 2200 });
  return (
    <svg
      viewBox="0 0 900 140"
      preserveAspectRatio="none"
      className={cn('block h-24 w-full', className)}
      aria-hidden="true"
    >
      <path d={AREA_D} className="fill-chart-1/10" />
      <path
        ref={traceRef}
        d={TRACE_D}
        fill="none"
        className="stroke-primary"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      {EVENTS.map(([x, y], i) => (
        <g key={i} className="animate-fade-rise" style={{ animationDelay: `${3400 + i * 160}ms` }}>
          <line
            x1={x}
            y1={y - 4}
            x2={x}
            y2={y - 16}
            className="stroke-ember/60"
            strokeWidth="0.9"
            strokeDasharray="2 2"
          />
          <circle cx={x} cy={y - 19} r="2.2" className="fill-ember" />
        </g>
      ))}
    </svg>
  );
}
