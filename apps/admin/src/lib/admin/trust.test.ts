import { describe, expect, it } from "vitest"
import {
  INITIAL_GRIEVANCE_FILTER,
  appealNeedsStepUp,
  grievanceDueState,
  grievanceListUrl,
  grievanceNeedsStepUp,
  nextAppealStatuses,
  nextGrievanceStatuses,
  nextReportStatuses,
} from "./trust"

const NOW = Date.parse("2026-09-16T12:00:00Z")
const HOUR = 3_600_000

describe("grievance filter", () => {
  it("defaults to overdue only", () => {
    expect(INITIAL_GRIEVANCE_FILTER.overdueOnly).toBe(true)
    expect(grievanceListUrl(INITIAL_GRIEVANCE_FILTER)).toBe("/v1/admin/trust/grievances?overdue=true&limit=50&offset=0")
  })

  it("never sends status together with overdue (the server refuses both)", () => {
    const url = grievanceListUrl({ overdueOnly: true, status: "acknowledged" }, 50)
    expect(url).toContain("overdue=true")
    expect(url).not.toContain("status=")
    expect(url).toContain("offset=50")
  })

  it("filters by status once overdue-only is off", () => {
    expect(grievanceListUrl({ overdueOnly: false, status: "open" })).toBe("/v1/admin/trust/grievances?status=open&limit=50&offset=0")
    expect(grievanceListUrl({ overdueOnly: false, status: "" })).toBe("/v1/admin/trust/grievances?limit=50&offset=0")
  })
})

describe("grievance due state", () => {
  const due = (hours: number, status = "open") => ({ status, due_at: new Date(NOW + hours * HOUR).toISOString() })

  it("is overdue past due_at, due soon within 48 hours, on time after", () => {
    expect(grievanceDueState(due(-1), NOW)).toBe("overdue")
    expect(grievanceDueState(due(1), NOW)).toBe("due_soon")
    expect(grievanceDueState(due(48), NOW)).toBe("due_soon")
    expect(grievanceDueState(due(49), NOW)).toBe("on_time")
  })

  it("is closed once resolved or rejected, and unknown without a due date", () => {
    expect(grievanceDueState(due(-100, "resolved"), NOW)).toBe("closed")
    expect(grievanceDueState(due(-100, "rejected"), NOW)).toBe("closed")
    expect(grievanceDueState({ status: "open" }, NOW)).toBe("unknown")
  })
})

describe("trust transitions and step-up hints", () => {
  it("follows the service's transitions", () => {
    expect(nextGrievanceStatuses("open")).toEqual(["acknowledged", "resolved", "rejected"])
    expect(nextGrievanceStatuses("acknowledged")).toEqual(["resolved", "rejected"])
    expect(nextGrievanceStatuses("resolved")).toEqual([])
    expect(nextAppealStatuses("under_review")).toEqual(["upheld", "overturned"])
    expect(nextAppealStatuses("upheld")).toEqual([])
    expect(nextReportStatuses("open")).toEqual(["reviewing"])
  })

  it("marks overturning an appeal and closing a grievance as step-up", () => {
    expect(appealNeedsStepUp("overturned")).toBe(true)
    expect(appealNeedsStepUp("upheld")).toBe(false)
    expect(grievanceNeedsStepUp("resolved")).toBe(true)
    expect(grievanceNeedsStepUp("acknowledged")).toBe(false)
  })
})
