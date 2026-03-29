// frontend/src/components/layout/Breadcrumbs.tsx
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split('/').filter(Boolean);

  if (segments.length === 0) {
    return (
      <div className="bg-primary/10 dark:bg-primary/20 px-6 py-2">
        <span className="font-display text-xs font-semibold uppercase tracking-wide text-primary-dark dark:text-primary">
          Home
        </span>
      </div>
    );
  }

  return (
    <div className="bg-primary/10 dark:bg-primary/20 px-6 py-2">
      <div className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-wide">
        <Link to="/dashboard" className="text-primary-dark hover:underline dark:text-primary dark:hover:text-primary/80">
          Home
        </Link>
        {segments.map((segment, i) => (
          <span key={i} className="flex items-center gap-2">
            <ChevronRight className="h-3 w-3 text-gray-400 dark:text-muted-foreground" />
            {i < segments.length - 1 ? (
              <Link
                to={`/${segments.slice(0, i + 1).join('/')}`}
                className="text-primary-dark hover:underline dark:text-primary dark:hover:text-primary/80"
              >
                {decodeURIComponent(segment)}
              </Link>
            ) : (
              <span className="text-gray-700 dark:text-foreground">{decodeURIComponent(segment)}</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
