// frontend/src/components/docs/DocPrevNext.tsx
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { getPrevNext } from '@/lib/docs-navigation';

interface DocPrevNextProps {
  slug: string;
}

export function DocPrevNext({ slug }: DocPrevNextProps) {
  const { prev, next } = getPrevNext(slug);

  if (!prev && !next) return null;

  return (
    <div className="mt-10 flex items-center justify-between border-t border-border pt-6">
      {prev ? (
        <Link
          to={`/docs/${prev.slug}`}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
          {prev.label}
        </Link>
      ) : (
        <span />
      )}
      {next ? (
        <Link
          to={`/docs/${next.slug}`}
          className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
        >
          {next.label}
          <ChevronRight className="h-4 w-4" />
        </Link>
      ) : (
        <span />
      )}
    </div>
  );
}
