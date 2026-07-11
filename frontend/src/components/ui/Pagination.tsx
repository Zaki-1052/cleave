// frontend/src/components/ui/Pagination.tsx — the app's single pagination control.
// Controlled and source-agnostic: drives server-side pagers and DataTable's client-side
// paging alike. Range text is data, so it's set in mono.
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/cn';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  className?: string;
}

function PageButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="rounded-md p-1.5 text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function Pagination({ page, pageSize, totalItems, onPageChange, className }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const rangeStart = totalItems > 0 ? (page - 1) * pageSize + 1 : 0;
  const rangeEnd = Math.min(page * pageSize, totalItems);

  if (totalItems === 0) return null;

  return (
    <div className={cn('flex items-center justify-between gap-4 py-2', className)}>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {rangeStart}–{rangeEnd} of {totalItems}
      </span>
      <div className="flex items-center gap-0.5">
        <PageButton onClick={() => onPageChange(1)} disabled={page <= 1} label="First page">
          <ChevronsLeft className="h-4 w-4" />
        </PageButton>
        <PageButton
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </PageButton>
        <PageButton
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </PageButton>
        <PageButton
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          label="Last page"
        >
          <ChevronsRight className="h-4 w-4" />
        </PageButton>
      </div>
    </div>
  );
}
