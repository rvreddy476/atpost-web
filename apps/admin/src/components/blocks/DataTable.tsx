"use client"

import { useEffect, useMemo, useReducer } from "react"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react"
import {
  applyTable,
  clearSelection,
  initialTableState,
  pageSelection,
  pruneSelection,
  setFilter,
  setPage,
  toggleRow,
  togglePage,
  toggleSort,
  type CellValue,
  type TableState,
} from "@/lib/table/state"
import { buttonGhost, buttonSecondary, inputClass } from "./buttons"

export interface DataColumn<Row> {
  key: string
  header: string
  /** The sortable/filterable value. */
  value: (row: Row) => CellValue
  /** How the cell renders; defaults to the value as text. */
  cell?: (row: Row) => React.ReactNode
  sortable?: boolean
  filterable?: boolean
  align?: "left" | "right"
}

type Action =
  | { type: "sort"; key: string }
  | { type: "filter"; key: string; text: string }
  | { type: "page"; page: number; pageCount: number }
  | { type: "row"; id: string }
  | { type: "page-select"; ids: string[] }
  | { type: "clear" }
  | { type: "prune"; ids: string[] }

function reducer(state: TableState, action: Action): TableState {
  switch (action.type) {
    case "sort":
      return toggleSort(state, action.key)
    case "filter":
      return setFilter(state, action.key, action.text)
    case "page":
      return setPage(state, action.page, action.pageCount)
    case "row":
      return toggleRow(state, action.id)
    case "page-select":
      return togglePage(state, action.ids)
    case "clear":
      return clearSelection(state)
    case "prune":
      return pruneSelection(state, action.ids)
  }
}

/**
 * The console's data table: sorting, per-column text filters, pagination,
 * row selection with a bulk-action bar, and explicit loading, error and empty
 * states. All logic is in lib/table/state.ts.
 */
export function DataTable<Row>({
  caption,
  rows,
  columns,
  rowId,
  loading = false,
  error = null,
  onRetry,
  emptyMessage = "Nothing here.",
  pageSize = 25,
  selectable = false,
  bulkActions,
}: {
  caption: string
  rows: Row[] | undefined
  columns: DataColumn<Row>[]
  rowId: (row: Row) => string
  loading?: boolean
  error?: string | null
  onRetry?: () => void
  emptyMessage?: string
  pageSize?: number
  selectable?: boolean
  /** Rendered above the table while rows are selected. */
  bulkActions?: (selectedIds: string[], clear: () => void) => React.ReactNode
}) {
  const [state, dispatch] = useReducer(reducer, pageSize, initialTableState)
  const data = useMemo(() => rows ?? [], [rows])
  const view = useMemo(() => applyTable(data, columns, state), [data, columns, state])
  const pageIds = view.rows.map(rowId)
  const selection = pageSelection(state, pageIds)
  const allIds = useMemo(() => data.map(rowId), [data, rowId])

  useEffect(() => {
    dispatch({ type: "prune", ids: allIds })
  }, [allIds])

  const filterable = columns.filter((c) => c.filterable)
  const colSpan = columns.length + (selectable ? 1 : 0)

  return (
    <div className="space-y-3">
      {filterable.length > 0 ? (
        <div className="flex flex-wrap gap-2" role="search" aria-label={`Filter ${caption}`}>
          {filterable.map((column) => (
            <input
              key={column.key}
              type="search"
              aria-label={`Filter by ${column.header}`}
              placeholder={`Filter ${column.header.toLowerCase()}`}
              value={state.filters[column.key] ?? ""}
              onChange={(e) => dispatch({ type: "filter", key: column.key, text: e.target.value })}
              className={`${inputClass} w-48`}
            />
          ))}
        </div>
      ) : null}

      {selectable && state.selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-mo-sm border border-mo bg-mo-raised px-3 py-2 text-sm" role="status">
          <span className="text-mo-ink">{state.selected.length} selected</span>
          {bulkActions?.(state.selected, () => dispatch({ type: "clear" }))}
          <button type="button" className={`${buttonGhost} ml-auto`} onClick={() => dispatch({ type: "clear" })}>
            Clear selection
          </button>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-mo border border-mo bg-mo-surface">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className="border-b border-mo text-xs uppercase tracking-wide text-mo-body">
            <tr>
              {selectable ? (
                <th scope="col" className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={selection === "all"}
                    ref={(el) => {
                      if (el) el.indeterminate = selection === "some"
                    }}
                    onChange={() => dispatch({ type: "page-select", ids: pageIds })}
                    disabled={pageIds.length === 0}
                    className="accent-mo-cyan"
                  />
                </th>
              ) : null}
              {columns.map((column) => {
                const sorted = state.sort?.key === column.key ? state.sort.direction : null
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={`px-3 py-2 font-semibold ${column.align === "right" ? "text-right" : ""}`}
                    aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : column.sortable ? "none" : undefined}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        onClick={() => dispatch({ type: "sort", key: column.key })}
                        className="inline-flex items-center gap-1 uppercase hover:text-mo-ink"
                      >
                        {column.header}
                        {sorted === "asc" ? (
                          <ArrowUp className="h-3 w-3" aria-hidden="true" />
                        ) : sorted === "desc" ? (
                          <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-50" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-8 text-center text-mo-body" role="status">
                  Loading…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-8 text-center" role="alert">
                  <span className="inline-flex items-center gap-2 text-mo-bad">
                    <TriangleAlert className="h-4 w-4" aria-hidden="true" /> {error}
                  </span>
                  {onRetry ? (
                    <button type="button" className={`${buttonSecondary} ml-3`} onClick={onRetry}>
                      Try again
                    </button>
                  ) : null}
                </td>
              </tr>
            ) : view.rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-3 py-8 text-center text-mo-body">
                  {data.length > 0 ? "No rows match these filters." : emptyMessage}
                </td>
              </tr>
            ) : (
              view.rows.map((row) => {
                const id = rowId(row)
                const checked = state.selected.includes(id)
                return (
                  <tr key={id} className={`border-b border-mo last:border-0 ${checked ? "bg-mo-raised/60" : ""}`}>
                    {selectable ? (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Select row ${id}`}
                          checked={checked}
                          onChange={() => dispatch({ type: "row", id })}
                          className="accent-mo-cyan"
                        />
                      </td>
                    ) : null}
                    {columns.map((column) => (
                      <td key={column.key} className={`px-3 py-2 text-mo-ink ${column.align === "right" ? "text-right" : ""}`}>
                        {column.cell ? column.cell(row) : String(column.value(row) ?? "")}
                      </td>
                    ))}
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && !error && view.total > state.pageSize ? (
        <div className="flex items-center justify-end gap-2 text-sm text-mo-body">
          <span>
            Page {view.page + 1} of {view.pageCount} · {view.total} rows
          </span>
          <button
            type="button"
            className={buttonSecondary}
            aria-label="Previous page"
            disabled={view.page === 0}
            onClick={() => dispatch({ type: "page", page: view.page - 1, pageCount: view.pageCount })}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className={buttonSecondary}
            aria-label="Next page"
            disabled={view.page >= view.pageCount - 1}
            onClick={() => dispatch({ type: "page", page: view.page + 1, pageCount: view.pageCount })}
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
