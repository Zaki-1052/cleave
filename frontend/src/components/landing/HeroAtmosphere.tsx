// frontend/src/components/landing/HeroAtmosphere.tsx — the hero's living backdrop:
// three parallax aurora discs (watercolor washes by day, glow fields by night), two
// bands of morphing topographic contours (SMIL d-morph; every keyframe for a ring comes
// from the same point list, so command structure always matches and interpolation can't
// silently break), and the seeded particle field (dust motes by day, fireflies by
// night). Entirely decorative: aria-hidden, pointer-events-none, z-0.
import type { CSSProperties } from 'react';
import { cn } from '@/lib/cn';
import { HERO_PARTICLES, mulberry32 } from './particles';
import { hueAt } from './theme';
import { useMouseParallax } from './hooks/useMouseParallax';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

interface Pt {
  x: number;
  y: number;
}

// Catmull-Rom-style smooth closed loop: N points in → M + N cubics + Z out, always.
function smoothClosedPath(pts: readonly Pt[]): string {
  const n = pts.length;
  const at = (i: number): Pt => pts[((i % n) + n) % n] ?? { x: 0, y: 0 };
  const first = at(0);
  let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const prev = at(i - 1);
    const curr = at(i);
    const next = at(i + 1);
    const after = at(i + 2);
    const c1x = curr.x + (next.x - prev.x) / 6;
    const c1y = curr.y + (next.y - prev.y) / 6;
    const c2x = next.x - (after.x - curr.x) / 6;
    const c2y = next.y - (after.y - curr.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${next.x.toFixed(1)} ${next.y.toFixed(1)}`;
  }
  return `${d} Z`;
}

interface ContourRing {
  frames: [string, string, string];
  cls: string;
  width: number;
  durS: number;
}

const RING_PHASES = [0, 2.1, 4.2] as const;

function buildBand(seed: number, ringClasses: readonly string[]): ContourRing[] {
  const rand = mulberry32(seed);
  const CX = 200;
  const CY = 170;
  const POINTS = 9;
  const RADII = [42, 70, 100, 134];
  const SQUASH = 0.78; // slightly elliptical, like a real hill seen on a map
  return RADII.map((radius, ringIdx) => {
    // Static per-point irregularity gives the ring its shape; a phase-shifted sine
    // wobble breathes it. Same point count/order every frame.
    const irregular = Array.from({ length: POINTS }, () => 1 + (rand() - 0.5) * 0.18);
    const phaseSeed = rand() * Math.PI * 2;
    const amp = 0.045 + ringIdx * 0.012;
    const frame = (phase: number): string =>
      smoothClosedPath(
        Array.from({ length: POINTS }, (_, i) => {
          const angle = (i / POINTS) * Math.PI * 2;
          const wobble = 1 + Math.sin(angle * 3 + phaseSeed + phase) * amp;
          const r = radius * (irregular[i] ?? 1) * wobble;
          return { x: CX + Math.cos(angle) * r, y: CY + Math.sin(angle) * r * SQUASH };
        }),
      );
    return {
      frames: [frame(RING_PHASES[0]), frame(RING_PHASES[1]), frame(RING_PHASES[2])],
      cls: ringClasses[ringIdx % ringClasses.length] ?? '',
      width: ringIdx === 0 ? 1.4 : ringIdx === 1 ? 1.1 : 0.9,
      durS: 15 + ringIdx * 3.5,
    };
  });
}

const BAND_A = buildBand(7, [
  'text-chart-1/20 dark:text-chart-1/30',
  'text-chart-3/20 dark:text-chart-3/30',
]);
const BAND_B = buildBand(23, [
  'text-chart-5/20 dark:text-chart-5/30',
  'text-chart-2/15 dark:text-chart-2/25',
]);

function ContourBand({
  rings,
  animate,
  className,
}: {
  rings: ContourRing[];
  animate: boolean;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 400 340" fill="none" className={className} aria-hidden="true">
      {rings.map((ring, i) => (
        <path key={i} d={ring.frames[0]} stroke="currentColor" strokeWidth={ring.width} className={ring.cls}>
          {animate && (
            <animate
              attributeName="d"
              dur={`${ring.durS}s`}
              repeatCount="indefinite"
              values={`${ring.frames[0]};${ring.frames[1]};${ring.frames[2]};${ring.frames[0]}`}
            />
          )}
        </path>
      ))}
    </svg>
  );
}

type ParticleStyle = CSSProperties &
  Record<'--drift-x' | '--drift-y' | '--p-o' | '--p-o-dark', string>;

export function HeroAtmosphere() {
  const reduced = usePrefersReducedMotion();
  const { containerRef, farRef, midRef, nearRef } = useMouseParallax();
  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
    >
      {/* Aurora discs — the only will-change layers; blurred solids, not gradients. */}
      <div
        ref={farRef}
        className="absolute -left-48 -top-56 h-[38rem] w-[38rem] rounded-full bg-chart-3 opacity-[0.05] blur-3xl will-change-transform dark:opacity-[0.13]"
      />
      <div
        ref={midRef}
        className="absolute -right-64 top-[-10rem] h-[44rem] w-[44rem] rounded-full bg-chart-1 opacity-[0.07] blur-3xl will-change-transform dark:opacity-[0.17]"
      />
      <div
        ref={nearRef}
        className="absolute -bottom-60 left-1/3 h-[36rem] w-[36rem] rounded-full bg-chart-5 opacity-[0.04] blur-3xl will-change-transform dark:opacity-[0.10]"
      />

      {/* Morphing terrain */}
      <ContourBand
        rings={BAND_A}
        animate={!reduced}
        className="absolute -top-16 right-[-6rem] h-[30rem] w-[36rem] md:right-[-2rem]"
      />
      <ContourBand
        rings={BAND_B}
        animate={!reduced}
        className="absolute -left-40 bottom-[-8rem] h-[26rem] w-[30rem]"
      />

      {/* Particle field — motes by day, fireflies by night */}
      <div className="absolute inset-0">
        {HERO_PARTICLES.map((p) => {
          const hue = hueAt(p.hueIndex);
          const style: ParticleStyle = {
            left: `${p.leftPct.toFixed(2)}%`,
            top: `${p.topPct.toFixed(2)}%`,
            width: `${p.sizePx.toFixed(1)}px`,
            height: `${p.sizePx.toFixed(1)}px`,
            animationDuration: `${p.durationS.toFixed(1)}s`,
            animationDelay: `${p.delayS.toFixed(1)}s`,
            '--drift-x': `${p.driftXPx.toFixed(1)}px`,
            '--drift-y': `${p.driftYPx.toFixed(1)}px`,
            '--p-o': p.opacity.toFixed(3),
            '--p-o-dark': p.opacityDark.toFixed(3),
          };
          return (
            <span
              key={p.id}
              className={cn(
                'absolute rounded-full bg-current opacity-[var(--p-o)] animate-particle-float dark:opacity-[var(--p-o-dark)] dark:shadow-[0_0_6px_currentColor]',
                hue.text,
              )}
              style={style}
            />
          );
        })}
      </div>
    </div>
  );
}
