// frontend/src/components/landing/HeroWordmark.tsx — the poster hero's type block:
// mono eyebrow, monumental Fraunces wordmark (rises as one unit — per-letter splitting
// would break the serif's kerning and ligatures), a word-staggered tagline whose real
// sentence lives in an sr-only twin, and a hand-drawn viridian underline that draws
// itself beneath "evidence." once the words settle.
import { Fragment, type CSSProperties } from 'react';
import { useDrawOnMount } from './hooks/useDrawOnMount';

const LEAD_WORDS = ['Where', 'raw', 'reads', 'become'];
const TAGLINE_BASE_MS = 320;
const WORD_STEP_MS = 55;

function riseDelay(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

export function HeroWordmark() {
  const underlineRef = useDrawOnMount({ delayMs: 1050, durationMs: 600 });
  return (
    <div className="relative z-10">
      <p
        className="animate-hero-rise font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
        style={riseDelay(0)}
      >
        Self-hosted CUT&RUN / CUT&Tag workbench · est. 0001
      </p>

      <h1
        className="mt-5 animate-hero-rise font-display text-6xl font-semibold leading-none tracking-[-0.03em] text-foreground sm:text-7xl md:text-8xl lg:text-9xl"
        style={riseDelay(90)}
      >
        Cleave
      </h1>

      <p className="sr-only">Where raw reads become evidence.</p>
      <p
        aria-hidden="true"
        className="mx-auto mt-6 max-w-2xl font-display text-2xl font-medium leading-snug text-foreground sm:text-3xl"
      >
        {LEAD_WORDS.map((word, i) => (
          <Fragment key={word}>
            <span
              className="inline-block animate-hero-rise"
              style={riseDelay(TAGLINE_BASE_MS + i * WORD_STEP_MS)}
            >
              {word}
            </span>{' '}
          </Fragment>
        ))}
        <span
          className="relative inline-block animate-hero-rise"
          style={riseDelay(TAGLINE_BASE_MS + LEAD_WORDS.length * WORD_STEP_MS)}
        >
          <em className="text-primary">evidence.</em>
          <svg
            className="absolute -bottom-2 left-0 h-2.5 w-full"
            viewBox="0 0 120 10"
            fill="none"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <path
              ref={underlineRef}
              d="M2 7.5 C 28 2.5, 64 9.5, 118 4"
              className="stroke-primary"
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          </svg>
        </span>
      </p>
    </div>
  );
}
