// frontend/src/lib/chart-theme.ts — theme-reactive chart colors and Recharts prop presets.
//
// Colors resolve to CONCRETE hsl() strings (not var() references) because one consumer
// serializes its SVG to PNG, where CSS custom properties don't apply. The palette is the
// validated categorical set behind --chart-1..6 (fixed assignment order: teal, ember,
// blue, oxide, plum, moss — never cycled, never reassigned when a filter drops a series).
//
// >6 categories: prefer folding the tail into "Other". For fixed semantic taxonomies
// that genuinely need more, extendChartPalette() derives light/dark companions of the
// base hues (paired scheme) — adjacent by hue with lightness separation. Any such
// palette must be re-validated (see dataviz skill validator) before shipping.
import { useMemo, useSyncExternalStore } from 'react';

const CHART_VAR_COUNT = 6;

function readVar(name: string): string {
  if (typeof window === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Concrete color strings for --chart-1..6 as currently themed. */
export function readChartPalette(): string[] {
  return Array.from({ length: CHART_VAR_COUNT }, (_, i) => {
    const triple = readVar(`--chart-${i + 1}`);
    if (!triple) throw new Error(`chart-theme: CSS variable --chart-${i + 1} is not defined`);
    return `hsl(${triple})`;
  });
}

/** Concrete color string for any theme token, e.g. chartToken('--muted-foreground'). */
export function chartToken(varName: string, alpha?: number): string {
  const triple = readVar(varName);
  if (!triple) throw new Error(`chart-theme: CSS variable ${varName} is not defined`);
  return alpha !== undefined ? `hsl(${triple} / ${alpha})` : `hsl(${triple})`;
}

// Re-read colors whenever the theme class on <html> flips.
function subscribeToThemeClass(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}

function themeClassSnapshot(): string {
  if (typeof window === 'undefined') return '';
  return document.documentElement.className;
}

/** The 6-color categorical palette, recomputed when the theme changes. */
export function useChartPalette(): string[] {
  const themeClass = useSyncExternalStore(subscribeToThemeClass, themeClassSnapshot, () => '');
  return useMemo(() => {
    // themeClass is the cache key: getComputedStyle results change when it flips.
    void themeClass;
    return readChartPalette();
  }, [themeClass]);
}

/** Theme-reactive resolver for arbitrary tokens (axis ink, grid hairlines, surfaces). */
export function useChartToken(varName: string, alpha?: number): string {
  const themeClass = useSyncExternalStore(subscribeToThemeClass, themeClassSnapshot, () => '');
  return useMemo(() => {
    void themeClass;
    return chartToken(varName, alpha);
  }, [themeClass, varName, alpha]);
}

/**
 * Derive an n-color palette from the base 6 by pairing each hue with a lighter
 * companion (ColorBrewer-Paired style). Positions 0..5 are the base palette
 * unchanged; 6..11 are companions in the same fixed order.
 */
export function extendChartPalette(n: number): string[] {
  const base = readChartPalette();
  if (n <= base.length) return base.slice(0, n);
  const extended = [...base];
  for (let i = base.length; i < Math.min(n, base.length * 2); i++) {
    const triple = readVar(`--chart-${(i % base.length) + 1}`);
    const parts = triple.split(/\s+/);
    const h = parts[0] ?? '0';
    const s = parseFloat(parts[1] ?? '50');
    const l = parseFloat(parts[2] ?? '50');
    const isDark = document.documentElement.classList.contains('dark');
    // Companions step away from the surface: lighter on light, darker on dark.
    const l2 = isDark ? Math.max(28, l - 16) : Math.min(72, l + 18);
    const s2 = Math.max(30, s - 12);
    extended.push(`hsl(${h} ${s2}% ${l2}%)`);
  }
  return extended;
}

/* ── Recharts prop presets — recessive grid and axes, mono tick labels ── */

export function useChartAxisProps() {
  const ink = useChartToken('--muted-foreground');
  const hairline = useChartToken('--border');
  return {
    tick: { fontSize: 11, fill: ink, fontFamily: 'var(--font-mono)' },
    axisLine: { stroke: hairline },
    tickLine: { stroke: hairline },
  } as const;
}

export function useChartGridProps() {
  const hairline = useChartToken('--border', 0.6);
  return { stroke: hairline, strokeDasharray: '3 3', vertical: false } as const;
}
