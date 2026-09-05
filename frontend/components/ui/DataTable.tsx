'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { PaginationMeta } from '@/types';
import { EmptyState } from './EmptyState';
import { TableSkeleton } from './LoadingState';

export interface Column<T> {
  key: string;
  header: string;
  /** Cell renderer. Receives the whole row so it can combine fields. */
  render: (row: T) => ReactNode;
  className?: string;
  headerClassName?: string;
  /** Hidden below `md` — use for secondary columns on narrow screens. */
  hideOnMobile?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  meta?: PaginationMeta;
  onPageChange?: (page: number) => void;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'Try widening your filters or a different time window.',
  onRowClick,
  meta,
  onPageChange,
  className,
}: DataTableProps<T>) {
  if (loading && rows.length === 0) {
    return <TableSkeleton rows={6} columns={Math.min(columns.length, 6)} />;
  }

  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className={cn('flex flex-col', className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line">
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    'whitespace-nowrap px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-fg-subtle',
                    column.hideOnMobile ? 'hidden md:table-cell' : '',
                    column.headerClassName,
                  )}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'border-b border-line/70 last:border-0 transition-colors',
                  onRowClick ? 'cursor-pointer hover:bg-surface-2' : '',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3 align-middle text-fg',
                      column.hideOnMobile ? 'hidden md:table-cell' : '',
                      column.className,
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {meta && onPageChange && meta.totalPages > 1 ? (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-fg-muted"
        >
          <p className="tims-data">
            {(meta.page - 1) * meta.pageSize + 1}&ndash;{Math.min(meta.page * meta.pageSize, meta.total)} of{' '}
            {meta.total}
          </p>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPageChange(meta.page - 1)}
              disabled={!meta.hasPreviousPage}
              className="inline-flex size-7 items-center justify-center rounded-md ring-1 ring-inset ring-line hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <span className="tims-data px-1">
              {meta.page} / {meta.totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(meta.page + 1)}
              disabled={!meta.hasNextPage}
              className="inline-flex size-7 items-center justify-center rounded-md ring-1 ring-inset ring-line hover:bg-surface-3 disabled:opacity-40 disabled:hover:bg-transparent"
              aria-label="Next page"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
