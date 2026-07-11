// frontend/src/components/landing/theme.ts — literal chart-hue class tables for the
// landing page's polychrome decoration (see DESIGN.md "Identity surfaces"). Tailwind's
// JIT only sees literal class strings, so every hue class lives here — never build
// `chart-${i}` templates anywhere; they are invisible to the scanner and get purged.

export interface HueClasses {
  /** Ink/stroke color, e.g. 'text-chart-1' — pair with `fill-current`/`bg-current`. */
  text: string;
  /** Solid fill, e.g. 'bg-chart-1'. */
  bg: string;
  /** 10% tint fill for pills/chips. */
  bg10: string;
  /** 30% tint border for pills/chips. */
  border30: string;
  /** SVG fill at 10%. */
  fill10: string;
  /** SVG stroke at 35%. */
  stroke35: string;
  /** The raw CSS custom property name, e.g. '--chart-1' (feeds `--tint-hue`). */
  cssVar: string;
}

export const HUES: readonly [HueClasses, ...HueClasses[]] = [
  {
    text: 'text-chart-1',
    bg: 'bg-chart-1',
    bg10: 'bg-chart-1/10',
    border30: 'border-chart-1/30',
    fill10: 'fill-chart-1/10',
    stroke35: 'stroke-chart-1/35',
    cssVar: '--chart-1',
  },
  {
    text: 'text-chart-2',
    bg: 'bg-chart-2',
    bg10: 'bg-chart-2/10',
    border30: 'border-chart-2/30',
    fill10: 'fill-chart-2/10',
    stroke35: 'stroke-chart-2/35',
    cssVar: '--chart-2',
  },
  {
    text: 'text-chart-3',
    bg: 'bg-chart-3',
    bg10: 'bg-chart-3/10',
    border30: 'border-chart-3/30',
    fill10: 'fill-chart-3/10',
    stroke35: 'stroke-chart-3/35',
    cssVar: '--chart-3',
  },
  {
    text: 'text-chart-4',
    bg: 'bg-chart-4',
    bg10: 'bg-chart-4/10',
    border30: 'border-chart-4/30',
    fill10: 'fill-chart-4/10',
    stroke35: 'stroke-chart-4/35',
    cssVar: '--chart-4',
  },
  {
    text: 'text-chart-5',
    bg: 'bg-chart-5',
    bg10: 'bg-chart-5/10',
    border30: 'border-chart-5/30',
    fill10: 'fill-chart-5/10',
    stroke35: 'stroke-chart-5/35',
    cssVar: '--chart-5',
  },
  {
    text: 'text-chart-6',
    bg: 'bg-chart-6',
    bg10: 'bg-chart-6/10',
    border30: 'border-chart-6/30',
    fill10: 'fill-chart-6/10',
    stroke35: 'stroke-chart-6/35',
    cssVar: '--chart-6',
  },
];

/** Cycle through the hue table; total function under noUncheckedIndexedAccess. */
export function hueAt(index: number): HueClasses {
  const i = ((index % HUES.length) + HUES.length) % HUES.length;
  return HUES[i] ?? HUES[0];
}
