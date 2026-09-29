import { describe, expect, it } from "vitest"
import {
  INITIAL_GRIEVANCE_FILTER,
  MAX_STRIKE_IDEMPOTENCY_KEY,
  appealNeedsStepUp,
  canVoidStrike,
  checkIssueStrike,
  emptyIssueStrike,
  grievanceDueState,
  grievanceListUrl,
  grievanceNeedsStepUp,
  issueStrikeAttempt,
  issueStrikeBody,
  nextAppealStatuses,
  nextGrievanceStatuses,
  nextReportStatuses,
  severityTone,
  strikeIssueUrl,
  strikeState,
  strikeVoidUrl,
  strikesUrl,
  voidStrikeBody,
  type IssueStrikeForm,
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

describe("strikes", () => {
  const user = "44444444-4444-4444-8444-444444444444"
  const content = "55555555-5555-4555-8555-555555555555"
  const form = (over: Partial<IssueStrikeForm> = {}): IssueStrikeForm => ({ ...emptyIssueStrike(user), reason: "repeat spam after a warning", ...over })
  const counter = () => {
    let n = 0
    return () => `key-${++n}`
  }

  it("builds the issue body with the key, trimmed, severity lower-cased, empty optionals left out", () => {
    expect(issueStrikeBody(form({ severity: " Severe_Strike ", reason: "  repeat spam after a warning " }), "k-1")).toEqual({
      user_id: user,
      severity: "severe_strike",
      reason: "repeat spam after a warning",
      idempotency_key: "k-1",
    })
    const body = issueStrikeBody(form({ contentId: ` ${content} `, contentType: " post " }), "k-2")
    expect(body.content_id).toBe(content)
    expect(body.content_type).toBe("post")
    expect(Object.keys(issueStrikeBody(form({ contentId: "  " }), "k-3"))).not.toContain("content_id")
  })

  it("mints one key per click and reuses it for a retry of the same form", () => {
    const make = counter()
    const first = issueStrikeAttempt(form(), null, make)
    expect(first.key).toBe("key-1")
    // The step-up retry, or "Issue strike" pressed again after a network error.
    expect(issueStrikeAttempt(form(), first, make)).toBe(first)
    expect(issueStrikeAttempt(form({ reason: "  repeat spam after a warning  " }), first, make).key).toBe("key-1")
    // A different action is a different key.
    expect(issueStrikeAttempt(form({ severity: "warning" }), first, make).key).toBe("key-2")
    expect(issueStrikeAttempt(form({ contentId: content }), first, make).key).toBe("key-3")
  })

  it("mints a UUID by default, within trust-safety's key limit", () => {
    const { key } = issueStrikeAttempt(form(), null)
    expect(key).toMatch(/^[0-9a-f-]{36}$/)
    expect(key.length).toBeLessThanOrEqual(MAX_STRIKE_IDEMPOTENCY_KEY)
  })

  it("builds the void body", () => {
    expect(voidStrikeBody(` ${content} `, " issued against the wrong account ")).toEqual({ strike_id: content, reason: "issued against the wrong account" })
  })

  it("refuses a form the server would refuse, before it is sent", () => {
    expect(checkIssueStrike(form())).toBeNull()
    expect(checkIssueStrike(form({ userId: "nope" }))).toMatch(/user's id/)
    expect(checkIssueStrike(form({ severity: "ban" }))).toMatch(/severity/)
    expect(checkIssueStrike(form({ severity: " STRIKE " }))).toBeNull()
    expect(checkIssueStrike(form({ contentId: "post-1" }))).toMatch(/content id/)
    expect(checkIssueStrike(form({ contentType: "x".repeat(65) }))).toMatch(/content type/)
  })

  it("routes through admin-service's trust prefix", () => {
    expect(strikesUrl(user)).toBe(`/v1/admin/trust/strikes/${user}`)
    expect(strikeIssueUrl()).toBe("/v1/admin/trust/strikes")
    expect(strikeVoidUrl(user)).toBe(`/v1/admin/trust/strikes/${user}/void`)
  })

  it("is voided over expired, expired once expires_at has passed, active otherwise", () => {
    const expires = (hours: number) => new Date(NOW + hours * HOUR).toISOString()
    expect(strikeState({ expires_at: expires(24) }, NOW)).toBe("active")
    expect(strikeState({ expires_at: expires(-1) }, NOW)).toBe("expired")
    expect(strikeState({ expires_at: expires(-1), voided_at: expires(-2) }, NOW)).toBe("voided")
    expect(strikeState({ expires_at: expires(24), voided_at: expires(-2) }, NOW)).toBe("voided")
    // A row without a readable expiry still counts until the server says otherwise.
    expect(strikeState({}, NOW)).toBe("active")
    expect(canVoidStrike({ voided_at: expires(-2) })).toBe(false)
    expect(canVoidStrike({ expires_at: expires(-1) })).toBe(true)
  })

  it("colours severity by how much it matters", () => {
    expect(severityTone("severe_strike")).toBe("bad")
    expect(severityTone("strike")).toBe("warn")
    expect(severityTone("warning")).toBe("normal")
    expect(severityTone(undefined)).toBe("normal")
  })
})
