// frontend/src/components/landing/CapabilityCard.tsx — capability card with a per-card
// hue identity: tinted icon chip (glows faintly by night), hue-tinted tag pills with ink
// text, and the .hover-tint radial ignition. The hue arrives as a CSS custom property on
// an inheriting wrapper (Card exposes no style prop, and custom properties cascade).
// Interactive chrome (hover border, focus) stays viridian via Card's own recipe.
import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Card } from '@/components/layout/Card';
import { hueAt } from './theme';

interface CapabilityCardProps {
  icon: LucideIcon;
  title: string;
  desc: string;
  tags: readonly string[];
  hueIndex: number;
}

export function CapabilityCard({ icon: Icon, title, desc, tags, hueIndex }: CapabilityCardProps) {
  const hue = hueAt(hueIndex);
  return (
    <div className="h-full" style={{ '--tint-hue': `var(${hue.cssVar})` } as CSSProperties}>
      <Card variant="interactive" className="hover-tint flex h-full flex-col p-5">
        <span
          className={cn(
            'flex h-9 w-9 items-center justify-center rounded-md',
            hue.bg10,
            hue.text,
            'dark:shadow-[0_0_10px_-2px_currentColor]',
          )}
        >
          <Icon className="h-4 w-4 text-foreground/75" />
        </span>
        <h3 className="mt-4 text-base font-semibold text-foreground">{title}</h3>
        <p className="mb-4 mt-1.5 text-sm leading-relaxed text-muted-foreground">{desc}</p>
        <div className="mt-auto flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className={cn(
                'rounded-full border px-2 py-0.5 font-mono text-[11px] text-muted-foreground',
                hue.border30,
                hue.bg10,
              )}
            >
              {tag}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}
