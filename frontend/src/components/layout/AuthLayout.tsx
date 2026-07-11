// frontend/src/components/layout/AuthLayout.tsx — shared frame for the auth screens:
// paper surface, contour-field backdrop, brand block, one centered card.
import type { ReactNode } from 'react';
import { GradientBackground } from './GradientBackground';
import { ContourField } from './ContourField';
import { Card } from './Card';
import { CleaveIcon } from '@/components/ui/CleaveIcon';

interface AuthLayoutProps {
  title: string;
  children: ReactNode;
}

export function AuthLayout({ title, children }: AuthLayoutProps) {
  return (
    <GradientBackground>
      <div className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10">
        <ContourField className="pointer-events-none absolute inset-0 h-full w-full text-primary/[0.07]" />
        <div className="relative mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
            <CleaveIcon size={30} />
          </div>
          <h1 className="font-display text-3xl font-semibold text-foreground">Cleave</h1>
          <p className="mt-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            CUT&amp;RUN Analysis Platform
          </p>
        </div>
        <Card className="relative w-full max-w-md">
          <h2 className="mb-6 text-center font-display text-2xl font-semibold text-foreground">
            {title}
          </h2>
          {children}
        </Card>
      </div>
    </GradientBackground>
  );
}
