// frontend/src/components/ui/DataTable.tsx
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, Inbox } from 'lucide-react';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T, unknown>[];
  pageSize?: number;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T>({ data, columns, pageSize = 25, emptyMessage = 'No data', onRowClick }: DataTableProps<T>) {
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

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Inbox className="mb-3 h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm tabular-nums">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} className="border-b bg-muted dark:bg-muted/80">
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="cursor-pointer select-none px-4 py-3 font-semibold text-foreground"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() ? (
                        header.column.getIsSorted() === 'asc' ? (
                          <ChevronUp className="ml-1 inline h-3.5 w-3.5" />
                        ) : header.column.getIsSorted() === 'desc' ? (
                          <ChevronDown className="ml-1 inline h-3.5 w-3.5" />
                        ) : (
                          <ChevronsUpDown className="ml-1 inline h-3.5 w-3.5 text-muted-foreground" />
                        )
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={`border-b hover:bg-muted/80 dark:hover:bg-muted/50${onRowClick ? ' cursor-pointer' : ''}`}
                onClick={() => onRowClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-3 text-sm text-muted-foreground">
        <span>
          Records per page: {table.getState().pagination.pageSize}
        </span>
        <span>
          {table.getState().pagination.pageIndex * table.getState().pagination.pageSize + 1}-
          {Math.min(
            (table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
            data.length,
          )}{' '}
          of {data.length}
        </span>
      </div>
    </div>
  );
}
