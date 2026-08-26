"use client";

import { ArrowDownWideNarrow, ArrowUpNarrowWide, Filter } from "lucide-react";
import { cn } from "@/lib/cn";

export type OrderDir = "asc" | "desc";

export function OrderToggle({
  order,
  onChange,
  title,
}: {
  order: OrderDir;
  onChange: (v: OrderDir) => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(order === "asc" ? "desc" : "asc")}
      title={title ?? (order === "asc" ? "Crescente ↑" : "Decrescente ↓")}
      aria-label={title}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-200 text-zinc-500 shadow-xs transition hover:bg-zinc-50 hover:text-zinc-700 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/6 dark:hover:text-zinc-200"
    >
      {order === "asc" ? (
        <ArrowUpNarrowWide className="h-4 w-4" />
      ) : (
        <ArrowDownWideNarrow className="h-4 w-4" />
      )}
    </button>
  );
}

/**
 * Compact filter + sort toolbar. Renders nothing when there are no options.
 * - `filters`: [{ value, label }] — first option should be the "all" value.
 * - `sortOptions`: [{ value, label }] — sort keys the page knows how to apply.
 */
export function ListToolbar({
  filters,
  filter,
  onFilter,
  sortOptions,
  sort,
  onSort,
  order,
  onOrder,
  filterLabel,
  sortLabel,
  orderTitle,
  className,
}: {
  filters?: { value: string; label: string }[];
  filter?: string;
  onFilter?: (v: string) => void;
  sortOptions?: { value: string; label: string }[];
  sort?: string;
  onSort?: (v: string) => void;
  order: OrderDir;
  onOrder: (v: OrderDir) => void;
  filterLabel?: string;
  sortLabel?: string;
  orderTitle?: string;
  className?: string;
}) {
  const hasFilters = !!filters?.length && onFilter && filter !== undefined;
  const hasSort = !!sortOptions?.length && onSort && sort !== undefined;
  if (!hasFilters && !hasSort) return null;

  const selectCls =
    "h-9 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-700 shadow-xs outline-none transition focus:border-indigo-500/60 focus:ring-2 focus:ring-indigo-500/20 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 [&>option]:bg-white dark:[&>option]:bg-zinc-900";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {hasFilters && (
        <div className="flex items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <select
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            className={selectCls}
            aria-label={filterLabel ?? "Filter"}
          >
            {filters.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
      )}
      {hasSort && (
        <div className="flex items-center gap-1.5">
          <select
            value={sort}
            onChange={(e) => onSort(e.target.value)}
            className={selectCls}
            aria-label={sortLabel ?? "Sort"}
          >
            {sortOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <OrderToggle order={order} onChange={onOrder} title={orderTitle} />
        </div>
      )}
    </div>
  );
}
