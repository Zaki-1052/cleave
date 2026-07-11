// frontend/src/components/ui/PageHeader.tsx — two roles in one component:
//  1. Bare <PageHeader /> (mounted once in the app shell): renders the auto breadcrumb
//     trail derived from the URL, replacing the old tinted Breadcrumbs strip.
//  2. <PageHeader title eyebrow actions .../> (rendered by pages): the specimen-label
//     page heading — mono eyebrow over a serif title, actions on the right.
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';

interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title?: ReactNode;
  eyebrow?: string;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: Crumb[];
  className?: string;
}

function useAutoCrumbs(): Crumb[] {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: Crumb[] = [{ label: 'Home', href: '/dashboard' }];
  segments.forEach((segment, i) => {
    if (segment === 'dashboard') return;
    const path = `/${segments.slice(0, i + 1).join('/')}`;
    const isLast = i === segments.length - 1;
    // Only linkify segments that resolve to a real route (resource-detail pages).
    // Collection prefixes ("/projects", "/experiments") and mid-nested tab segments
    // have no standalone route, so they render as plain text — never dead links.
    const linkable = !isLast && /^\/(projects|experiments)\/[^/]+$/.test(path);
    crumbs.push({
      label: decodeURIComponent(segment),
      href: linkable ? path : undefined,
    });
  });
  return crumbs;
}

function BreadcrumbTrail({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length <= 1) return null;
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.08em]"
    >
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/50" />}
          {crumb.href ? (
            <Link
              to={crumb.href}
              className="text-muted-foreground transition-colors duration-150 hover:text-primary"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground/80">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  const autoCrumbs = useAutoCrumbs();

  // Bare usage: breadcrumb trail only (the app-shell strip).
  if (!title) {
    return (
      <div className={cn('mb-5', className)}>
        <BreadcrumbTrail crumbs={breadcrumbs ?? autoCrumbs} />
      </div>
    );
  }

  return (
    <div className={cn('mb-6', className)}>
      {breadcrumbs && (
        <div className="mb-3">
          <BreadcrumbTrail crumbs={breadcrumbs} />
        </div>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-2xl font-semibold text-foreground">{title}</h1>
          {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
