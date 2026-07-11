// frontend/src/components/ui/DataTable.tsx — generic client-side table.
// Pagination is real (shared Pagination control); loading renders layout-stable skeleton
// rows; empty delegates to EmptyState. All original props keep their behavior.
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Inbox } from 'lucide-react';
import { cn } from '@/lib/cn';
import { EmptyState } from './EmptyState';
import { Skeleton } from './Skeleton';
import { Pagination } from './Pagination';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  pageSize?: number;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
  /** Render skeleton rows while the query is in flight (layout-stable loading). */
  isLoading?: boolean;
  /** Slot rendered above the table (search inputs, filters, actions). */
  toolbar?: ReactNode;
  /** Hide the built-in pager when an external (server-side) Pagination drives the data. */
  showPagination?: boolean;
  /** Keep the header row visible inside scrolling containers. */
  stickyHeader?: boolean;
}

function SkeletonRows({ columnCount, rowCount = 8 }: { columnCount: number; rowCount?: number }) {
  return (
    <>
      {Array.from({ length: rowCount }).map((_, r) => (
        <tr key={r} className="border-b border-border/70">
          {Array.from({ length: columnCount }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <Skeleton className={cn('h-4', c === 0 ? 'w-3/4' : 'w-1/2')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function DataTable<T>({
  data,
  columns,
  pageSize = 25,
  emptyMessage = 'No data',
  onRowClick,
  isLoading = false,
  toolbar,
  showPagination = true,
  stickyHeader = false,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  if (!isLoading && data.length === 0) {
    return (
      <div>
        {toolbar && <div className="mb-3">{toolbar}</div>}
        <EmptyState icon={Inbox} title={emptyMessage} />
      </div>
    );
  }

  const { pageIndex } = table.getState().pagination;

  return (
    <div>
      {toolbar && <div className="mb-3">{toolbar}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead className={cn(stickyHeader && 'sticky top-0 z-10 bg-card')}>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b-2 border-border">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'select-none px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground',
                        canSort && 'cursor-pointer transition-colors duration-150 hover:text-foreground',
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <span className="inline-flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {canSort ? (
                          sorted === 'asc' ? (
                            <ChevronUp className="h-3.5 w-3.5 text-primary" />
                          ) : sorted === 'desc' ? (
                            <ChevronDown className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <ChevronsUpDown className="h-3.5 w-3.5 text-muted-foreground/40" />
                          )
                        ) : null}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {isLoading ? (
              <SkeletonRows columnCount={columns.length} />
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-border/70 transition-colors duration-150 hover:bg-accent/50',
                    onRowClick && 'cursor-pointer',
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {showPagination && !isLoading && (
        <Pagination
          className="px-4"
          page={pageIndex + 1}
          pageSize={table.getState().pagination.pageSize}
          totalItems={data.length}
          onPageChange={(p) => table.setPageIndex(p - 1)}
        />
      )}
    </div>
  );
}
