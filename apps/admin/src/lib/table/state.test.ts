import { describe, expect, it } from "vitest"
import {
  applyTable,
  clearSelection,
  initialTableState,
  pageSelection,
  pruneSelection,
  setFilter,
  setPage,
  setPageSize,
  toggleRow,
  togglePage,
  toggleSort,
  type ColumnAccess,
} from "./state"

interface Row {
  id: string
  name: string
  amount: number | null
  created: Date
}

const rows: Row[] = [
  { id: "a", name: "Asha Stores", amount: 1200, created: new Date("2026-09-03") },
  { id: "b", name: "bharat traders", amount: 90, created: new Date("2026-09-01") },
  { id: "c", name: "Chai Point 10", amount: null, created: new Date("2026-09-02") },
  { id: "d", name: "Chai Point 9", amount: 90, created: new Date("2026-09-04") },
  { id: "e", name: "Deccan Foods", amount: 5000, created: new Date("2026-08-30") },
]

const columns: ColumnAccess<Row>[] = [
  { key: "name", value: (r) => r.name },
  { key: "amount", value: (r) => r.amount },
  { key: "created", value: (r) => r.created },
]

const ids = (view: { rows: Row[] }) => view.rows.map((r) => r.id)

describe("sorting", () => {
  it("cycles ascending, descending, off, and resets the page", () => {
    let s = { ...initialTableState(2), page: 2 }
    s = toggleSort(s, "amount")
    expect(s.sort).toEqual({ key: "amount", direction: "asc" })
    expect(s.page).toBe(0)
    s = toggleSort(s, "amount")
    expect(s.sort?.direction).toBe("desc")
    s = toggleSort(s, "amount")
    expect(s.sort).toBeNull()
    expect(toggleSort(toggleSort(s, "amount"), "name").sort).toEqual({ key: "name", direction: "asc" })
  })

  it("sorts numbers numerically, keeps ties stable and sinks empty cells in both directions", () => {
    const asc = applyTable(rows, columns, { ...initialTableState(10), sort: { key: "amount", direction: "asc" } })
    expect(ids(asc)).toEqual(["b", "d", "a", "e", "c"])
    const desc = applyTable(rows, columns, { ...initialTableState(10), sort: { key: "amount", direction: "desc" } })
    expect(ids(desc)).toEqual(["e", "a", "b", "d", "c"])
  })

  it("sorts text case-insensitively with natural numbers, and dates by time", () => {
    const byName = applyTable(rows, columns, { ...initialTableState(10), sort: { key: "name", direction: "asc" } })
    expect(ids(byName)).toEqual(["a", "b", "d", "c", "e"])
    const byDate = applyTable(rows, columns, { ...initialTableState(10), sort: { key: "created", direction: "desc" } })
    expect(ids(byDate)).toEqual(["d", "a", "c", "b", "e"])
  })
})

describe("filtering", () => {
  it("matches case-insensitive substrings across every filtered column and returns to page one", () => {
    let s = { ...initialTableState(10), page: 3 }
    s = setFilter(s, "name", "CHAI")
    expect(s.page).toBe(0)
    expect(ids(applyTable(rows, columns, s))).toEqual(["c", "d"])
    s = setFilter(s, "amount", "90")
    expect(ids(applyTable(rows, columns, s))).toEqual(["d"])
    s = setFilter(s, "amount", "  ")
    expect(s.filters).toEqual({ name: "CHAI" })
  })

  it("ignores filters on unknown columns", () => {
    expect(applyTable(rows, columns, setFilter(initialTableState(10), "nope", "x")).total).toBe(5)
  })
})

describe("pagination", () => {
  it("slices pages and reports the count", () => {
    const s = initialTableState(2)
    const first = applyTable(rows, columns, s)
    expect(ids(first)).toEqual(["a", "b"])
    expect(first.pageCount).toBe(3)
    expect(ids(applyTable(rows, columns, setPage(s, 2, 3)))).toEqual(["e"])
  })

  it("clamps page changes and a page left beyond the end by a filter", () => {
    const s = initialTableState(2)
    expect(setPage(s, 9, 3).page).toBe(2)
    expect(setPage(s, -1, 3).page).toBe(0)
    const shrunk = applyTable(rows, columns, { ...s, page: 2, filters: { name: "chai" } })
    expect(shrunk.page).toBe(0)
    expect(ids(shrunk)).toEqual(["c", "d"])
    expect(applyTable([], columns, s)).toMatchObject({ total: 0, pageCount: 1, page: 0, rows: [] })
    expect(setPageSize({ ...s, page: 2 }, 50)).toMatchObject({ pageSize: 50, page: 0 })
  })
})

describe("selection", () => {
  it("toggles rows and whole pages, and reports the page state", () => {
    let s = initialTableState(2)
    s = toggleRow(s, "a")
    expect(pageSelection(s, ["a", "b"])).toBe("some")
    s = togglePage(s, ["a", "b"])
    expect(s.selected).toEqual(["a", "b"])
    expect(pageSelection(s, ["a", "b"])).toBe("all")
    s = toggleRow(s, "e")
    s = togglePage(s, ["a", "b"])
    expect(s.selected).toEqual(["e"])
    expect(pageSelection(s, ["a", "b"])).toBe("none")
    expect(clearSelection(s).selected).toEqual([])
  })

  it("keeps selection across sorting and paging, and prunes rows that disappeared", () => {
    let s = toggleRow(initialTableState(2), "e")
    s = toggleSort(s, "name")
    s = setPage(s, 1, 3)
    expect(s.selected).toEqual(["e"])
    expect(pruneSelection(s, ["a", "b"]).selected).toEqual([])
    expect(pruneSelection(s, ["e"])).toBe(s)
  })
})
