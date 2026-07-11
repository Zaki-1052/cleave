// frontend/src/components/landing/particles.ts — deterministic particle field for the
// hero atmosphere. A seeded PRNG (mulberry32) generates the layout once at module scope,
// so it is identical across renders and reloads; the motion itself comes from the shared
// `particle-float` keyframe, varied per particle via duration/delay/drift custom props.

export function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LandingParticle {
  id: number;
  leftPct: number;
  topPct: number;
  sizePx: number;
  durationS: number;
  /** Negative → starts mid-cycle, so the field never moves in lockstep. */
  delayS: number;
  driftXPx: number;
  driftYPx: number;
  hueIndex: number;
  /** Day: barely-there ink motes. */
  opacity: number;
  /** Night: fireflies. */
  opacityDark: number;
}

export function generateParticles(count: number, seed: number): LandingParticle[] {
  const rand = mulberry32(seed);
  const between = (lo: number, hi: number): number => lo + rand() * (hi - lo);
  return Array.from({ length: count }, (_, id) => ({
    id,
    leftPct: between(2, 98),
    topPct: between(4, 96),
    sizePx: between(1.5, 3.5),
    durationS: between(14, 32),
    delayS: -between(0, 20),
    driftXPx: between(8, 30) * (rand() < 0.5 ? -1 : 1),
    driftYPx: -between(14, 40),
    hueIndex: Math.floor(rand() * 6),
    opacity: between(0.05, 0.11),
    opacityDark: between(0.12, 0.3),
  }));
}

export const HERO_PARTICLES: readonly LandingParticle[] = generateParticles(28, 1052);
