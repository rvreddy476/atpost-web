import { describe, expect, it } from "vitest"
import {
  EMPTY_AUDIT_FILTER,
  auditFilterProblem,
  auditQueryString,
  currentCursor,
  firstAuditPage,
  nextAuditPage,
  previousAuditPage,
} from "./audit"

const ACTOR = "00000000-0000-4000-8000-00000000A001"

describe("audit filter → query string", () => {
  it("sends only the limit when nothing is filtered", () => {
    expect(auditQueryString(EMPTY_AUDIT_FILTER)).toBe("limit=50")
  })

  it("sends every filter admin-service accepts, dates as whole India-time days", () => {
    const q = new URLSearchParams(
      auditQueryString({ app: "food", actor: ACTOR, operation: " food.order.cancel ", outcome: "denied", from: "2026-09-01", to: "2026-09-16" }, "abc"),
    )
    expect(Object.fromEntries(q)).toEqual({
      app: "food",
      actor: ACTOR.toLowerCase(),
      operation: "food.order.cancel",
      outcome: "denied",
      from: "2026-09-01T00:00:00+05:30",
      to: "2026-09-17T00:00:00+05:30",
      limit: "50",
      cursor: "abc",
    })
  })

  it("encodes the timezone so '+' survives the query string", () => {
    expect(auditQueryString({ ...EMPTY_AUDIT_FILTER, from: "2026-09-01" })).toContain("from=2026-09-01T00%3A00%3A00%2B05%3A30")
  })

  it("rolls the end date over month ends", () => {
    expect(new URLSearchParams(auditQueryString({ ...EMPTY_AUDIT_FILTER, to: "2026-09-30" })).get("to")).toBe("2026-10-01T00:00:00+05:30")
  })

  it("leaves out filters the server would refuse, and says why", () => {
    const bad = { ...EMPTY_AUDIT_FILTER, app: "Food!", actor: "someone", outcome: "maybe" }
    const q = new URLSearchParams(auditQueryString(bad))
    expect(q.has("app")).toBe(false)
    expect(q.has("actor")).toBe(false)
    expect(q.has("outcome")).toBe(false)
    expect(auditFilterProblem(bad)).toMatch(/Actor/)
    expect(auditFilterProblem({ ...EMPTY_AUDIT_FILTER, from: "2026-09-10", to: "2026-09-01" })).toMatch(/after/)
    expect(auditFilterProblem(EMPTY_AUDIT_FILTER)).toBeNull()
  })
})

describe("audit cursor paging", () => {
  it("walks forward with next_cursor and back through the cursors seen", () => {
    let p = firstAuditPage()
    expect(currentCursor(p)).toBeNull()
    p = nextAuditPage(p, "c1")
    p = nextAuditPage(p, "c2")
    expect(currentCursor(p)).toBe("c2")
    expect(nextAuditPage(p, "")).toBe(p)
    p = previousAuditPage(p)
    expect(currentCursor(p)).toBe("c1")
    p = previousAuditPage(previousAuditPage(p))
    expect(currentCursor(p)).toBeNull()
  })
})
