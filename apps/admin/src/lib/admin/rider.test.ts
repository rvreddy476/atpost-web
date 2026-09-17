import { describe, expect, it } from "vitest"
import { initialReveal, isBlurred, revealReducer, type RevealState } from "../blocks/reveal"
import { ADMIN_APPS } from "./apps"
import { parseAdminMe } from "./me"
import {
  EMPTY_FARE_RULE,
  EMPTY_REPORT_FILTER,
  RIDER_REPORTS,
  RIDER_REVEALS,
  RIDER_WRITES,
  checkCity,
  checkFareRule,
  checkZone,
  isLiveRide,
  maskPhone,
  readAlerts,
  readDocuments,
  reportTable,
  riderAuditQuery,
  riderListQuery,
  riderReportUrl,
  riderStepUp,
  type RiderWrite,
} from "./rider"
import { RIDER_SECTIONS, can, canReadStats, visibleSections } from "./sections"
import { statsView } from "./stats"

const navigation = ADMIN_APPS.map((app) => ({ app: app.id, label: app.label }))

function me(apps: Record<string, string[]>, platform: string[] = []) {
  const parsed = parseAdminMe({ data: { user_id: "u-1", permissions: { platform, apps }, mfa: { required: true, verified: true }, navigation } })
  if (!parsed) throw new Error("fixture did not parse")
  return parsed
}

const ids = (sections: { id: string }[]) => sections.map((s) => s.id)

describe("Mopedu sections per permission set", () => {
  it("a document reviewer sees only Documents; an incident revealer only Safety incidents", () => {
    expect(ids(visibleSections(me({ rider: ["rider:documents.review"] }), "rider", RIDER_SECTIONS))).toEqual(["documents"])
    expect(ids(visibleSections(me({ rider: ["rider:incidents.reveal"] }), "rider", RIDER_SECTIONS))).toEqual(["incidents"])
  })

  it("partner suspend alone opens Partners (the detail's buttons check approve separately)", () => {
    const m = me({ rider: ["rider:partners.suspend", "rider:rides.cancel"] })
    expect(ids(visibleSections(m, "rider", RIDER_SECTIONS))).toEqual(["partners", "rides"])
    expect(can(m, "rider", "partners.approve")).toBe(false)
    expect(can(m, "rider", "partners.read")).toBe(false)
    expect(canReadStats(m, "rider")).toBe(false)
  })

  it("a platform wildcard sees all eleven; a Feast admin sees none", () => {
    expect(ids(visibleSections(me({}, ["*"]), "rider", RIDER_SECTIONS))).toEqual(RIDER_SECTIONS.map((s) => s.id))
    expect(RIDER_SECTIONS).toHaveLength(11)
    expect(visibleSections(me({ food: ["food:orders.read"] }), "rider", RIDER_SECTIONS)).toEqual([])
  })
})

describe("what needs a fresh 2FA code", () => {
  it("matches admin-service's route table", () => {
    const writes = Object.keys(RIDER_WRITES) as RiderWrite[]
    expect(writes.filter(riderStepUp)).toEqual([
      "partner.suspend",
      "partner.block",
      "document.verify",
      "document.reject",
      "payment.verify",
      "payment.reject",
      "ride.cancel",
      "fare_rule.create",
      "fare_rule.update",
    ])
    for (const w of writes) expect(RIDER_WRITES[w].permission).toMatch(/\./)
    // Every destructive write asks for a reason the audit row keeps.
    for (const w of writes) if (RIDER_WRITES[w].destructive) expect(RIDER_WRITES[w].reason).toBe(true)
  })

  it("the document list and an incident's alerts are reveals with their own permission", () => {
    expect(RIDER_REVEALS.documents.permission).toBe("documents.review")
    expect(RIDER_REVEALS.documents.path("pending")).toBe("/v1/admin/rider/documents?status=pending")
    expect(RIDER_REVEALS.documents.path("")).toBe("/v1/admin/rider/documents")
    expect(RIDER_REVEALS.incidentAlerts.permission).toBe("incidents.reveal")
    expect(RIDER_REVEALS.incidentAlerts.path("inc-1")).toBe("/v1/admin/rider/safety/incidents/inc-1/alerts")
  })
})

describe("reveal state for the document list and the contact alerts", () => {
  const run = (events: Parameters<typeof revealReducer>[1][]) => events.reduce<RevealState>(revealReducer, initialReveal(true))

  it("starts hidden, and a dismissed step-up leaves it hidden", () => {
    expect(isBlurred(initialReveal(true))).toBe(true)
    const dismissed = run([{ type: "request" }, { type: "resolved", revealed: false }])
    expect(dismissed).toEqual({ status: "hidden", error: null })
    expect(isBlurred(dismissed)).toBe(true)
  })

  it("only a resolved reveal unblurs; Hide drops it again", () => {
    const revealed = run([{ type: "request" }, { type: "resolved", revealed: true }])
    expect(isBlurred(revealed)).toBe(false)
    expect(revealReducer(revealed, { type: "hide" })).toEqual({ status: "hidden", error: null })
  })

  it("a failed read shows the error and stays blurred; a second click while revealing is ignored", () => {
    const failed = run([{ type: "request" }, { type: "failed", error: "It could not be revealed." }])
    expect(failed).toEqual({ status: "failed", error: "It could not be revealed." })
    expect(isBlurred(failed)).toBe(true)
    const revealing = run([{ type: "request" }])
    expect(revealReducer(revealing, { type: "request" })).toBe(revealing)
    // A resolved event that arrives while not revealing changes nothing.
    expect(revealReducer(initialReveal(true), { type: "resolved", revealed: true })).toEqual(initialReveal(true))
  })

  it("reads the revealed rows leniently and never invents a document number", () => {
    const rows = readDocuments({ data: { items: [{ id: "d1", document_type: "driving_licence", document_number: "DL-01" }, "junk", { id: "d2" }] } })
    expect(rows.map((r) => r.id)).toEqual(["d1", "d2"])
    expect(rows[1].document_number).toBeUndefined()
    expect(readAlerts({ data: { alerts: [{ id: "a1", contact_phone: "+919876543210" }] } })).toHaveLength(1)
    expect(readAlerts({ data: null })).toEqual([])
  })
})

describe("queue filters and paging", () => {
  it("leaves empty filters out and always sends limit and offset", () => {
    expect(riderListQuery({ status: "pending_verification", q: "" }, 50)).toBe("status=pending_verification&limit=50&offset=50")
    expect(riderListQuery({ status: "", q: " asha " })).toBe("q=asha&limit=50&offset=0")
  })

  it("drops a malformed actor from the audit filter rather than sending it wrong, and dates become India time", () => {
    expect(riderAuditQuery({ action: "partner.approve", targetKind: "", actor: "not-a-uuid", since: "2026-09-01" })).toBe(
      `action=partner.approve&since=${encodeURIComponent("2026-09-01T00:00:00+05:30")}&limit=50&offset=0`,
    )
    expect(riderAuditQuery({ action: "", targetKind: "partner", actor: "00000000-0000-4000-8000-00000000A001", since: "bad" })).toBe("target_kind=partner&actor=00000000-0000-4000-8000-00000000a001&limit=50&offset=0")
  })

  it("knows which ride statuses are live (cancel is offered only then)", () => {
    expect(isLiveRide("in_progress")).toBe(true)
    expect(isLiveRide("searching_partner")).toBe(true)
    expect(isLiveRide("completed")).toBe(false)
    expect(isLiveRide("cancelled_by_admin")).toBe(false)
  })

  it("masks phone numbers in lists", () => {
    expect(maskPhone("+91 98765 43210")).toBe("•••• 3210")
    expect(maskPhone("12")).toBe("••••")
    expect(maskPhone(null)).toBe("—")
  })
})

describe("fare rule, city and zone forms", () => {
  const valid = { ...EMPTY_FARE_RULE, city_id: "11111111-1111-4111-8111-111111111111", vehicle_type: "bike", base_fare: "25", per_km_fare: "8.5", per_minute_fare: "1", minimum_fare: "40", platform_fee: "5", cancellation_fee: "20" }

  it("accepts a complete rule and sends numbers, not strings", () => {
    const check = checkFareRule(valid)
    expect(check.ok).toBe(true)
    if (check.ok) expect(check.body).toEqual({ city_id: valid.city_id, vehicle_type: "bike", base_fare: 25, per_km_fare: 8.5, per_minute_fare: 1, minimum_fare: 40, platform_fee: 5, cancellation_fee: 20, night_multiplier: 1, peak_multiplier: 1 })
  })

  it("refuses a negative amount, a multiplier under 1, a minimum below the base fare and a bad city", () => {
    const check = checkFareRule({ ...valid, city_id: "x", per_km_fare: "-1", night_multiplier: "0.5", minimum_fare: "10" })
    expect(check.ok).toBe(false)
    if (!check.ok) {
      expect(check.problems).toContain("City must be a full city id.")
      expect(check.problems.some((p) => p.startsWith("per km fare"))).toBe(true)
      expect(check.problems.some((p) => p.startsWith("night multiplier"))).toBe(true)
      expect(check.problems).toContain("Minimum fare cannot be below the base fare.")
    }
  })

  it("a partial update sends only the fields filled in, and refuses an empty one", () => {
    const some = checkFareRule({ ...EMPTY_FARE_RULE, night_multiplier: "", peak_multiplier: "", cancellation_fee: "", base_fare: "30" }, { partial: true })
    expect(some).toEqual({ ok: true, body: { base_fare: 30 } })
    const none = checkFareRule({ ...EMPTY_FARE_RULE, night_multiplier: "", peak_multiplier: "", cancellation_fee: "" }, { partial: true })
    expect(none).toEqual({ ok: false, problems: ["Change at least one field."] })
  })

  it("checks a city and a zone before sending", () => {
    expect(checkCity({ name: "Hyderabad", state: "Telangana", country: "in", currency_code: "inr" })).toEqual({ ok: true, body: { name: "Hyderabad", state: "Telangana", country: "IN", currency_code: "INR" } })
    expect(checkCity({ name: "H", state: "", country: "IND", currency_code: "RS" }).ok).toBe(false)
    expect(checkZone({ city_id: valid.city_id, name: "Gachibowli", boundary_wkt: "POLYGON((78.3 17.4, 78.4 17.4, 78.4 17.5, 78.3 17.4))" }).ok).toBe(true)
    expect(checkZone({ city_id: valid.city_id, name: "Gachibowli", boundary_wkt: "78.3 17.4" }).ok).toBe(false)
  })
})

describe("reports", () => {
  it("has the nine, and sends each only the filters it takes", () => {
    expect(RIDER_REPORTS.map((r) => r.id)).toEqual(["matching-health", "partner-quality", "supply-demand", "safety", "compliance", "revenue", "cohort-retention", "customer-cohort", "cron-runs"])
    const filter = { ...EMPTY_REPORT_FILTER, from: "2026-09-01", to: "2026-09-15", by: "month", cohort_month: "2026-08", job: "settle", city: "Hyderabad" }
    expect(riderReportUrl(RIDER_REPORTS[0], filter)).toBe(`/v1/admin/rider/reports/matching-health?from=${encodeURIComponent("2026-09-01T00:00:00+05:30")}&to=${encodeURIComponent("2026-09-15T23:59:59+05:30")}`)
    expect(riderReportUrl(RIDER_REPORTS[5], filter)).toBe("/v1/admin/rider/reports/revenue?by=month")
    expect(riderReportUrl(RIDER_REPORTS[6], filter)).toBe("/v1/admin/rider/reports/cohort-retention?cohort_month=2026-08")
    expect(riderReportUrl(RIDER_REPORTS[8], { ...filter, job: "" })).toBe("/v1/admin/rider/reports/cron-runs")
    expect(riderReportUrl(RIDER_REPORTS[4], filter)).toBe("/v1/admin/rider/reports/compliance?city=Hyderabad")
  })

  it("tables `{rows}` with the union of keys, and an object of counts as one row", () => {
    const t = reportTable({ data: { rows: [{ day: "2026-09-01", offers: 10 }, { day: "2026-09-02", offers: 12, accepted: 9 }] } })
    expect(t.columns).toEqual(["day", "offers", "accepted"])
    expect(t.rows).toHaveLength(2)
    const one = reportTable({ data: { total: 3, failed: 1 } })
    expect(one.columns).toEqual(["total", "failed"])
    expect(one.rows).toHaveLength(1)
    expect(reportTable({ data: null }).rows).toEqual([])
  })
})

describe("Mopedu stats", () => {
  it("puts partners pending, open incidents and open complaints first, and reads paise", () => {
    const view = statsView("rider", { status: "ok", raw: { data: { partners_pending_review: 2, open_safety_incidents: 1, open_complaints: 0, revenue_today_paise: 150000, generated_at: "2026-09-17T09:00:00Z" } } })
    expect(view.tiles.slice(0, 3).map((t) => t.key)).toEqual(["partners_pending_review", "open_safety_incidents", "open_complaints"])
    expect(view.tiles[0]).toMatchObject({ display: "2", tone: "warn" })
    expect(view.tiles[1]).toMatchObject({ display: "1", tone: "bad" })
    expect(view.tiles[2]).toMatchObject({ display: "0", tone: "normal" })
    expect(view.tiles.find((t) => t.key === "revenue_today_paise")?.display).toBe("₹1,500.00")
    expect(view.tiles.find((t) => t.key === "live_rides_now")?.display).toBe("unavailable")
  })

  it("is unavailable, never zero, when the call failed", () => {
    const view = statsView("rider", { status: "error", message: "Stats could not be loaded." }, 3)
    expect(view.state).toBe("unavailable")
    expect(view.tiles.every((t) => t.display === "unavailable")).toBe(true)
  })
})
