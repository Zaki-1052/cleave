// frontend/src/components/layout/Breadcrumbs.tsx
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return (
      <div className="bg-primary/20 px-6 py-2">
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-primary-dark">
          Home
        </span>
      </div>
    );
  }

  return (
    <div className="bg-primary/20 px-6 py-2">
      <div className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-wide">
        <Link to="/" className="text-primary-dark hover:underline">
          Home
        </Link>
        {segments.map((segment, i) => (
          <span key={i} className="flex items-center gap-2">
            <ChevronRight className="h-3 w-3 text-muted-foreground" />
            {i < segments.length - 1 ? (
              <Link
                to={`/${segments.slice(0, i + 1).join('/')}`}
                className="text-primary-dark hover:underline"
              >
                {decodeURIComponent(segment)}
              </Link>
            ) : (
              <span className="text-foreground">{decodeURIComponent(segment)}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
