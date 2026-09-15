'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Sortable data table.
 *
 * Hairline rules, mono numerics, right-aligned numeric columns, no zebra
 * striping — the reading aid is alignment, not background colour. Row hover is
 * a 150ms surface change driven by CSS rather than JS.
 */

export interface Column<T> {
  key: string;
  header: string;
  /** Right-align and render in mono. Set for every numeric column. */
  numeric?: boolean;
  /** Sort key sent to the API. Omit to make the column unsortable. */
  sortKey?: string;
  width?: string;
  render: (row: T) => ReactNode;
  /** Hidden below the md breakpoint, for columns that are nice-to-have. */
  secondary?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  sortBy,
  sortOrder,
  onSort,
  emptyMessage = 'No records',
  className,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  emptyMessage?: string;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => {
              const isSorted = sortBy === column.sortKey;
              const sortable = Boolean(column.sortKey && onSort);

              return (
                <th
                  key={column.key}
                  scope="col"
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(
                    'bg-surface-2 px-2.5 py-1.5 align-middle',
                    column.numeric && 'text-right',
                    column.secondary && 'hidden md:table-cell',
                  )}
                  aria-sort={isSorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => onSort?.(column.sortKey as string)}
                      className={cn(
                        'tims-label tims-nav-item -mx-1 px-1 py-0.5 hover:text-fg',
                        isSorted && 'text-fg',
                      )}
                    >
                      {column.header}
                      <span className="ml-1 inline-block w-2 text-fg-subtle">
                        {isSorted ? (sortOrder === 'asc' ? '↑' : '↓') : ''}
                      </span>
                    </button>
                  ) : (
                    <span className="tims-label">{column.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-[12px] text-fg-subtle">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'tims-row border-b border-line/70',
                  onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-2.5 py-2 align-middle text-[12px] text-fg',
                      column.numeric && 'tims-data text-right',
                      column.secondary && 'hidden md:table-cell',
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Pagination footer. Mono counters, square buttons. */
export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-t border-line px-3 py-2',
        className,
      )}
    >
      <p className="tims-data text-[11px] text-fg-subtle">
        {first}–{last} of {total.toLocaleString('en-IN')}
      </p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="tims-nav-item tims-data border border-line px-2 py-1 text-[11px] text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-35"
        >
          ← Prev
        </button>
        <span className="tims-data px-2 text-[11px] text-fg-muted">
          {page} / {Math.max(1, totalPages)}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="tims-nav-item tims-data border border-line px-2 py-1 text-[11px] text-fg-muted hover:border-line-strong hover:text-fg disabled:cursor-not-allowed disabled:opacity-35"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
