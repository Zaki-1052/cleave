// frontend/src/components/landing/ArchitectureDiagram.tsx — the colophon's instrument
// schematic: hue-tinted node boxes with mono labels, hairline arrows, and an ember dot
// traveling the SSE edge on loop (SMIL animateMotion with an inline path — no mpath/
// xlink). Under reduced motion the dot parks at the edge's midpoint instead of moving.
import { hueAt } from './theme';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from './hooks/usePrefersReducedMotion';

interface DiagramBox {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const BOXES: readonly DiagramBox[] = [
  { label: 'browser', x: 26, y: 22, w: 104, h: 36 },
  { label: 'nginx', x: 186, y: 22, w: 88, h: 36 },
  { label: 'api', x: 330, y: 22, w: 84, h: 36 },
  { label: 'postgres', x: 470, y: 22, w: 108, h: 36 },
  { label: 'worker', x: 330, y: 104, w: 84, h: 36 },
  { label: 'pipeline', x: 470, y: 104, w: 108, h: 36 },
  { label: '/data/cleave', x: 470, y: 172, w: 108, h: 30 },
];

// [x1, y1, x2, y2]; heads point at (x2, y2).
const ARROWS: readonly [number, number, number, number][] = [
  [130, 40, 186, 40],
  [274, 40, 330, 40],
  [414, 40, 470, 40],
  [414, 122, 470, 122],
  [524, 140, 524, 172],
];

// api ⇕ worker — the live edge the ember dot travels.
const SSE_EDGE = 'M372 58 L372 104 L372 58';

function arrowHead([, , x2, y2]: readonly [number, number, number, number], vertical: boolean): string {
  return vertical
    ? `${x2 - 3},${y2 - 5} ${x2 + 3},${y2 - 5} ${x2},${y2}`
    : `${x2 - 5},${y2 - 3} ${x2 - 5},${y2 + 3} ${x2},${y2}`;
}

export function ArchitectureDiagram({ className }: { className?: string }) {
  const reduced = usePrefersReducedMotion();
  return (
    <svg
      viewBox="0 0 700 214"
      className={cn('h-auto w-full max-w-[650px]', className)}
      role="img"
      aria-label="Architecture: browser through nginx to the api and postgres; a worker runs the pipeline and writes to /data/cleave; the api streams live updates over SSE."
    >
      {ARROWS.map((arrow, i) => {
        const [x1, y1, x2, y2] = arrow;
        const vertical = x1 === x2;
        return (
          <g key={i}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-border" strokeWidth={1.2} />
            <polygon points={arrowHead(arrow, vertical)} className="fill-border" />
          </g>
        );
      })}

      {/* SSE edge + traveling ember dot */}
      <path d="M372 58 L372 104" className="stroke-border" strokeWidth={1.2} strokeDasharray="3 3" />
      <text x={382} y={85} fontSize={8} className="fill-muted-foreground/70 font-mono">
        SSE
      </text>
      {reduced ? (
        <circle cx={372} cy={81} r={2.5} className="fill-ember" />
      ) : (
        <circle r={2.5} className="fill-ember">
          <animateMotion dur="5s" repeatCount="indefinite" path={SSE_EDGE} />
        </circle>
      )}

      {BOXES.map((box, i) => {
        const hue = hueAt(i);
        return (
          <g key={box.label}>
            <rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              rx={8}
              className={cn(hue.fill10, hue.stroke35)}
              strokeWidth={1}
            />
            <text
              x={box.x + box.w / 2}
              y={box.y + box.h / 2 + 3.5}
              textAnchor="middle"
              fontSize={10}
              className="fill-foreground/75 font-mono"
            >
              {box.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
