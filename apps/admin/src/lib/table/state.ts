/**
 * The data table's state as plain data and pure transitions, so sorting,
 * filtering, paging and selection are tested without rendering anything.
 *
 * Client-side only. A queue large enough to need server paging passes its own
 * rows per page and `total`, and uses the same state for the controls.
 */

export type SortDirection = "asc" | "desc"

export interface TableState {
  sort: { key: string; direction: SortDirection } | null
  /** Zero-based. */
  page: number
  pageSize: number
  /** Column key → text the cell must contain (case-insensitive). */
  filters: Record<string, string>
  /** Selected row ids; kept across pages, sorts and filters (see pruneSelection). */
  selected: string[]
}

export const initialTableState = (pageSize = 25): TableState => ({
  sort: null,
  page: 0,
  pageSize,
  filters: {},
  selected: [],
})

export type CellValue = string | number | boolean | Date | null | undefined

export interface ColumnAccess<Row> {
  key: string
  value: (row: Row) => CellValue
}

/** Unsorted → ascending → descending → unsorted. */
export function toggleSort(state: TableState, key: string): TableState {
  let sort: TableState["sort"]
  if (!state.sort || state.sort.key !== key) sort = { key, direction: "asc" }
  else if (state.sort.direction === "asc") sort = { key, direction: "desc" }
  else sort = null
  return { ...state, sort, page: 0 }
}

/** A filter change always returns to the first page. */
export function setFilter(state: TableState, key: string, text: string): TableState {
  const filters = { ...state.filters }
  if (text.trim()) filters[key] = text
  else delete filters[key]
  return { ...state, filters, page: 0 }
}

export function setPage(state: TableState, page: number, pageCount: number): TableState {
  const last = Math.max(0, pageCount - 1)
  return { ...state, page: Math.min(Math.max(0, Math.floor(page)), last) }
}

export function setPageSize(state: TableState, pageSize: number): TableState {
  return { ...state, pageSize: Math.max(1, Math.floor(pageSize)), page: 0 }
}

export function toggleRow(state: TableState, id: string): TableState {
  const selected = state.selected.includes(id) ? state.selected.filter((s) => s !== id) : [...state.selected, id]
  return { ...state, selected }
}

/** Selects every row on the page, or clears them if all were selected. */
export function togglePage(state: TableState, pageIds: string[]): TableState {
  const all = pageIds.length > 0 && pageIds.every((id) => state.selected.includes(id))
  const selected = all
    ? state.selected.filter((id) => !pageIds.includes(id))
    : [...state.selected, ...pageIds.filter((id) => !state.selected.includes(id))]
  return { ...state, selected }
}

export const clearSelection = (state: TableState): TableState => ({ ...state, selected: [] })

export function pageSelection(state: TableState, pageIds: string[]): "none" | "some" | "all" {
  const count = pageIds.filter((id) => state.selected.includes(id)).length
  if (count === 0) return "none"
  return count === pageIds.length ? "all" : "some"
}

function asText(value: CellValue): string {
  if (value === null || value === undefined) return ""
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

function compare(a: CellValue, b: CellValue): number {
  const emptyA = a === null || a === undefined || a === ""
  const emptyB = b === null || b === undefined || b === ""
  // Empty cells sink to the bottom in both directions (handled by the caller).
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime()
  if (typeof a === "number" && typeof b === "number") return a - b
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b)
  return asText(a).localeCompare(asText(b), undefined, { numeric: true, sensitivity: "base" })
}

export interface TableView<Row> {
  rows: Row[]
  /** Rows after filtering, before paging. */
  total: number
  pageCount: number
  /** The page actually shown, clamped when filtering shrank the table. */
  page: number
}

export function applyTable<Row>(rows: Row[], columns: ColumnAccess<Row>[], state: TableState): TableView<Row> {
  const byKey = new Map(columns.map((c) => [c.key, c]))

  let out = rows.filter((row) =>
    Object.entries(state.filters).every(([key, text]) => {
      const column = byKey.get(key)
      if (!column) return true
      return asText(column.value(row)).toLowerCase().includes(text.trim().toLowerCase())
    }),
  )

  const sortColumn = state.sort ? byKey.get(state.sort.key) : undefined
  if (state.sort && sortColumn) {
    const sign = state.sort.direction === "asc" ? 1 : -1
    out = out
      .map((row, index) => ({ row, index }))
      .sort((x, y) => {
        const a = sortColumn.value(x.row)
        const b = sortColumn.value(y.row)
        const emptyA = a === null || a === undefined || a === ""
        const emptyB = b === null || b === undefined || b === ""
        if (emptyA || emptyB) return compare(a, b) || x.index - y.index
        return sign * compare(a, b) || x.index - y.index
      })
      .map(({ row }) => row)
  }

  const total = out.length
  const pageCount = Math.max(1, Math.ceil(total / state.pageSize))
  const page = Math.min(state.page, pageCount - 1)
  const start = page * state.pageSize
  return { rows: out.slice(start, start + state.pageSize), total, pageCount, page }
}

/** Drops selected ids that no longer exist in the data (after a refetch). */
export function pruneSelection(state: TableState, existingIds: string[]): TableState {
  const keep = state.selected.filter((id) => existingIds.includes(id))
  return keep.length === state.selected.length ? state : { ...state, selected: keep }
}
