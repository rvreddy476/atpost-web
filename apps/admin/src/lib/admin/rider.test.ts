import { describe, expect, it } from "vitest"
import { initialReveal, isBlurred, revealReducer, type RevealState } from "../blocks/reveal"
import { ADMIN_APPS } from "./apps"
import { parseAdminMe } from "./me"
import {
  EMPTY_COUPON,
  EMPTY_FARE_RULE,
  EMPTY_FARE_WINDOW,
  EMPTY_PAYMENT_FILTER,
  EMPTY_REPORT_FILTER,
  EVERY_DAY,
  MON_TO_FRI,
  RIDER_DONE,
  RIDER_REPORTS,
  RIDER_REVEALS,
  RIDER_WRITES,
  canRefund,
  checkCity,
  checkCoupon,
  checkFareRule,
  checkFareWindow,
  checkRefund,
  checkZone,
  cityScopedUrl,
  couponInput,
  couponStatus,
  couponValue,
  fareWindowInput,
  hhmmToMinutes,
  isLiveRide,
  maskPhone,
  minutesToHHMM,
  multiplierLabel,
  multiplierToBps,
  nextCursor,
  paise,
  readAlerts,
  readDocuments,
  refundBody,
  refundRemaining,
  reportTable,
  ridePaymentsQuery,
  riderAuditQuery,
  riderListQuery,
  riderReportUrl,
  riderStepUp,
  riderTwoPerson,
  surgeTone,
  toggleWeekday,
  weekdaysFromMask,
  weekdaysLabel,
  windowSpan,
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

  it("a platform wildcard sees all fourteen; a Feast admin sees none", () => {
    expect(ids(visibleSections(me({}, ["*"]), "rider", RIDER_SECTIONS))).toEqual(RIDER_SECTIONS.map((s) => s.id))
    expect(RIDER_SECTIONS).toHaveLength(14)
    expect(visibleSections(me({ food: ["food:orders.read"] }), "rider", RIDER_SECTIONS)).toEqual([])
  })

  it("fares.manage opens Fare rules, Pricing and Coupons; payments.read opens Payments and Money; settle alone opens Payments only", () => {
    expect(ids(visibleSections(me({ rider: ["rider:fares.manage"] }), "rider", RIDER_SECTIONS))).toEqual(["fares", "pricing", "coupons"])
    expect(ids(visibleSections(me({ rider: ["rider:payments.read"] }), "rider", RIDER_SECTIONS))).toEqual(["payments", "money"])
    // Money is a read section: a settler without the read permission cannot see the lists the refund starts from.
    const settler = me({ rider: ["rider:payments.settle"] })
    expect(ids(visibleSections(settler, "rider", RIDER_SECTIONS))).toEqual(["payments"])
    expect(can(settler, "rider", RIDER_WRITES["refund.issue"].permission)).toBe(true)
    expect(can(me({ rider: ["rider:payments.read"] }), "rider", RIDER_WRITES["outstanding.waive"].permission)).toBe(false)
  })
})

describe("what needs a fresh 2FA code, and what needs a second approver", () => {
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
      "fare_window.create",
      "fare_window.update",
      "fare_window.deactivate",
      "coupon.create",
      "coupon.update",
      "coupon.deactivate",
      "outstanding.waive",
      "refund.issue",
    ])
    for (const w of writes) expect(RIDER_WRITES[w].permission).toMatch(/\./)
    // Every destructive write asks for a reason the audit row keeps.
    for (const w of writes) if (RIDER_WRITES[w].destructive) expect(RIDER_WRITES[w].reason).toBe(true)
  })

  it("only the refund and the waiver are two-person: both step-up, both with a reason, both on payments.settle", () => {
    const writes = Object.keys(RIDER_WRITES) as RiderWrite[]
    expect(writes.filter(riderTwoPerson)).toEqual(["outstanding.waive", "refund.issue"])
    for (const w of writes.filter(riderTwoPerson)) {
      expect(RIDER_WRITES[w].stepUp).toBe(true)
      expect(RIDER_WRITES[w].reason).toBe(true)
      expect(RIDER_WRITES[w].permission).toBe("payments.settle")
      expect(RIDER_WRITES[w].explain).toMatch(/second admin/)
    }
    expect(RIDER_DONE["refund.issue"]).toBe("Refund issued")
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

  it("shows the money tiles only once rider's stats route reports them", () => {
    const without = statsView("rider", { status: "ok", raw: { data: { partners_pending_review: 2 } } })
    expect(without.tiles.map((t) => t.key)).not.toContain("payments_confirming")
    expect(without.tiles.map((t) => t.key)).not.toContain("outstanding_pending_paise")
    const withMoney = statsView("rider", { status: "ok", raw: { data: { partners_pending_review: 2, payments_confirming: 3, refunds_requested: 0, outstanding_pending_paise: 45000 } } })
    expect(withMoney.tiles.find((t) => t.key === "payments_confirming")).toMatchObject({ display: "3", tone: "warn" })
    expect(withMoney.tiles.find((t) => t.key === "refunds_requested")).toMatchObject({ display: "0", tone: "normal" })
    expect(withMoney.tiles.find((t) => t.key === "outstanding_pending_paise")?.display).toBe("₹450.00")
    expect(statsView("rider", { status: "loading" }).tiles.map((t) => t.key)).not.toContain("refunds_requested")
  })
})

describe("pricing: weekdays, times and multipliers", () => {
  it("converts minutes to HH:MM and back, with 24:00 as the end of the day", () => {
    expect(minutesToHHMM(0)).toBe("00:00")
    expect(minutesToHHMM(510)).toBe("08:30")
    expect(minutesToHHMM(1439)).toBe("23:59")
    expect(minutesToHHMM(1440)).toBe("24:00")
    expect(minutesToHHMM(1441)).toBe("—")
    expect(minutesToHHMM("x")).toBe("—")
    expect(hhmmToMinutes("08:30")).toBe(510)
    expect(hhmmToMinutes("8:05")).toBe(485)
    expect(hhmmToMinutes("24:00")).toBe(1440)
    expect(hhmmToMinutes("24:01")).toBeNull()
    expect(hhmmToMinutes("07:60")).toBeNull()
    expect(hhmmToMinutes("noon")).toBeNull()
    for (const m of [0, 1, 59, 60, 719, 720, 1439]) expect(hhmmToMinutes(minutesToHHMM(m))).toBe(m)
  })

  it("names a window's span, marking one that wraps midnight", () => {
    expect(windowSpan(480, 630)).toBe("08:00 – 10:30")
    expect(windowSpan(1380, 300)).toBe("23:00 – 05:00 (next day)")
    expect(windowSpan(null, 300)).toBe("—")
  })

  it("reads and writes the weekday bitmask (Mon=1 … Sun=64)", () => {
    expect(weekdaysFromMask(1)).toEqual(["Mon"])
    expect(weekdaysFromMask(MON_TO_FRI)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri"])
    expect(weekdaysFromMask(EVERY_DAY)).toHaveLength(7)
    expect(weekdaysFromMask(64 + 32)).toEqual(["Sat", "Sun"])
    expect(weekdaysFromMask("junk")).toEqual([])
    expect(toggleWeekday(MON_TO_FRI, 32)).toBe(63)
    expect(toggleWeekday(63, 1)).toBe(62)
    expect(weekdaysLabel(EVERY_DAY)).toBe("Every day")
    expect(weekdaysLabel(MON_TO_FRI)).toBe("Mon–Fri")
    expect(weekdaysLabel(96)).toBe("Sat–Sun")
    expect(weekdaysLabel(5)).toBe("Mon, Wed")
    expect(weekdaysLabel(0)).toBe("No days")
  })

  it("shows multipliers as ×1.25 and reads them within ×1.00–×3.00", () => {
    expect(multiplierLabel(12500)).toBe("×1.25")
    expect(multiplierLabel(10000)).toBe("×1.0")
    expect(multiplierLabel(15000)).toBe("×1.5")
    expect(multiplierLabel(null)).toBe("—")
    expect(multiplierToBps("1.25")).toBe(12500)
    expect(multiplierToBps("×1.5")).toBe(15000)
    expect(multiplierToBps("3")).toBe(30000)
    expect(multiplierToBps("0.9")).toBeNull()
    expect(multiplierToBps("3.01")).toBeNull()
    expect(multiplierToBps("")).toBeNull()
  })

  it("checks a fare window and sends minutes, a bitmask, basis points and India-time dates", () => {
    const city = "11111111-1111-4111-8111-111111111111"
    const check = checkFareWindow({ ...EMPTY_FARE_WINDOW, city_id: city.toUpperCase(), vehicle_type: "auto", name: "Morning peak", start: "08:00", end: "10:30", multiplier: "1.25", priority: "10", effective_from: "2026-10-01", effective_to: "2026-12-31" })
    expect(check).toEqual({
      ok: true,
      body: { city_id: city, vehicle_type: "auto", name: "Morning peak", days_of_week: MON_TO_FRI, start_minute: 480, end_minute: 630, multiplier_bps: 12500, priority: 10, effective_from: "2026-10-01T00:00:00+05:30", effective_to: "2026-12-31T23:59:59+05:30" },
    })
    const wrap = checkFareWindow({ ...EMPTY_FARE_WINDOW, city_id: city, name: "Night", days_of_week: EVERY_DAY, start: "23:00", end: "05:00", multiplier: "1.2" })
    expect(wrap.ok).toBe(true)
    if (wrap.ok) expect(wrap.body).toMatchObject({ start_minute: 1380, end_minute: 300, multiplier_bps: 12000, days_of_week: EVERY_DAY })
    expect(wrap.ok && "vehicle_type" in wrap.body).toBe(false)
    const bad = checkFareWindow({ ...EMPTY_FARE_WINDOW, city_id: "x", name: "", days_of_week: 0, start: "09:00", end: "09:00", multiplier: "4", priority: "-1", effective_from: "2026-10-01", effective_to: "2026-09-01" })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.problems).toEqual([
        "City must be a full city id.",
        "The window needs a name.",
        "Pick at least one day.",
        "Start and end cannot be the same minute.",
        "Multiplier must be between ×1.00 and ×3.00.",
        "Priority must be a whole number of zero or more.",
        "Effective to cannot be before effective from.",
      ])
    }
    // An update keeps the city and vehicle type as stored.
    const partial = checkFareWindow({ ...EMPTY_FARE_WINDOW, city_id: "", name: "Renamed", multiplier: "1.5" }, { partial: true })
    expect(partial.ok).toBe(true)
    if (partial.ok) expect(Object.keys(partial.body)).toEqual(["name", "days_of_week", "start_minute", "end_minute", "multiplier_bps", "priority"])
  })

  it("prefills the update form from a stored window", () => {
    expect(fareWindowInput({ id: "w1", city_id: "c1", vehicle_type: null, name: "Evening", days_of_week: 31, start_minute: 1050, end_minute: 1230, multiplier_bps: 12500, priority: 5, effective_from: "2026-09-01T00:00:00+05:30", effective_to: null })).toEqual({
      city_id: "c1",
      vehicle_type: "",
      name: "Evening",
      days_of_week: 31,
      start: "17:30",
      end: "20:30",
      multiplier: "1.25",
      priority: "5",
      effective_from: "2026-09-01",
      effective_to: "",
    })
  })

  it("lists and reads surge per city only with a full city id", () => {
    expect(cityScopedUrl("/fare-windows", "11111111-1111-4111-8111-111111111111")).toBe("/v1/admin/rider/fare-windows?city_id=11111111-1111-4111-8111-111111111111")
    expect(cityScopedUrl("/surge", "hyderabad")).toBeNull()
    expect(surgeTone({ vehicle_type: "bike", demand_bps: 10000, cap_bps: 20000 })).toBe("good")
    expect(surgeTone({ vehicle_type: "bike", demand_bps: 15000, cap_bps: 20000 })).toBe("normal")
    expect(surgeTone({ vehicle_type: "bike", demand_bps: 20000, cap_bps: 20000 })).toBe("warn")
  })
})

describe("coupons", () => {
  const city = "11111111-1111-4111-8111-111111111111"

  it("sends a flat coupon in paise and a percent coupon in basis points", () => {
    const flat = checkCoupon({ ...EMPTY_COUPON, code: "welcome-50", description: " First ride ", discount_value: "50", max_discount: "", min_fare: "99", per_user_limit: "1", total_limit: "1000", starts_at: "2026-10-01", ends_at: "2026-10-31", city_id: city, vehicle_types: ["bike"], first_ride_only: true })
    expect(flat).toEqual({
      ok: true,
      body: { code: "WELCOME-50", discount_type: "flat", city_id: city, vehicle_types: ["bike"], description: "First ride", discount_value_paise: 5000, min_fare_paise: 9900, per_user_limit: 1, total_limit: 1000, first_ride_only: true, starts_at: "2026-10-01T00:00:00+05:30", ends_at: "2026-10-31T23:59:59+05:30", is_active: true },
    })
    const percent = checkCoupon({ ...EMPTY_COUPON, code: "HALF", discount_type: "percent", percent: "50", max_discount: "100", per_user_limit: "0", total_limit: "" })
    expect(percent.ok).toBe(true)
    if (percent.ok) expect(percent.body).toEqual({ code: "HALF", discount_type: "percent", percent_bps: 5000, max_discount_paise: 10000, per_user_limit: 0, first_ride_only: false, is_active: true })
  })

  it("refuses a bad code, a zero flat amount, a percentage over 100, negative limits and a bad city", () => {
    const check = checkCoupon({ ...EMPTY_COUPON, code: "a", discount_value: "0", max_discount: "-1", per_user_limit: "1.5", city_id: "hyd", ends_at: "2026-01-01", starts_at: "2026-02-01" })
    expect(check.ok).toBe(false)
    if (!check.ok) {
      expect(check.problems).toContain("Code must be 3–32 letters, digits, _ or -.")
      expect(check.problems).toContain("A flat coupon needs a rupee amount above zero.")
      expect(check.problems).toContain("Maximum discount must be a rupee amount of zero or more.")
      expect(check.problems).toContain("Per-user limit must be a whole number (0 = unlimited).")
      expect(check.problems).toContain("City must be a full city id, or blank for every city.")
      expect(check.problems).toContain("Ends cannot be before starts.")
    }
    expect(checkCoupon({ ...EMPTY_COUPON, code: "PCT", discount_type: "percent", percent: "150" }).ok).toBe(false)
  })

  it("an update never sends the code, type or scope, and leaves blank amounts alone", () => {
    const check = checkCoupon({ ...couponInput({ code: "HALF", discount_type: "percent", percent_bps: 5000 }), percent: "", max_discount: "250" }, { partial: true })
    expect(check).toEqual({ ok: true, body: { max_discount_paise: 25000, per_user_limit: 0, total_limit: 0, first_ride_only: false, is_active: true } })
  })

  it("describes a coupon's value and status", () => {
    expect(couponValue({ discount_type: "flat", discount_value_paise: 5000 })).toBe("₹50.00 off")
    expect(couponValue({ discount_type: "percent", percent_bps: 2000, max_discount_paise: 10000 })).toBe("20% off, up to ₹100.00")
    expect(couponValue({ discount_type: "percent", percent_bps: 2500 })).toBe("25% off")
    const now = new Date("2026-09-18T10:00:00Z")
    expect(couponStatus({ is_active: true }, now)).toBe("active")
    expect(couponStatus({ is_active: false }, now)).toBe("inactive")
    expect(couponStatus({ is_active: true, ends_at: "2026-09-01T00:00:00Z" }, now)).toBe("expired")
    expect(couponStatus({ is_active: true, total_limit: 10, used_count: 10 }, now)).toBe("exhausted")
    expect(couponInput({ code: "X", discount_type: "flat", discount_value_paise: 4950, min_fare_paise: 0, starts_at: "2026-09-01T00:00:00+05:30" })).toMatchObject({ discount_value: "49.5", min_fare: "", starts_at: "2026-09-01", is_active: true })
  })
})

describe("money: paise, cursors and refunds", () => {
  it("formats paise as rupees and never invents a number", () => {
    expect(paise(12500)).toBe("₹125.00")
    expect(paise(1)).toBe("₹0.01")
    expect(paise(123456789)).toBe("₹12,34,567.89")
    expect(paise(0)).toBe("₹0.00")
    expect(paise(null)).toBe("—")
    // Money arrives as JSON numbers; a string is never read as an amount.
    expect(paise("12500")).toBe("—")
    expect(paise("lots")).toBe("—")
  })

  it("builds the ride-payments query and follows the server's cursor", () => {
    expect(ridePaymentsQuery(EMPTY_PAYMENT_FILTER)).toBe("")
    expect(ridePaymentsQuery({ status: "succeeded", method: "upi", from: "2026-09-01", to: "2026-09-15" }, "abc")).toBe(
      `status=succeeded&method=upi&from=${encodeURIComponent("2026-09-01T00:00:00+05:30")}&to=${encodeURIComponent("2026-09-15T23:59:59+05:30")}&cursor=abc`,
    )
    expect(ridePaymentsQuery({ ...EMPTY_PAYMENT_FILTER, from: "yesterday" })).toBe("")
    expect(nextCursor({ data: { items: [], next_cursor: "n1" } })).toBe("n1")
    expect(nextCursor({ data: { items: [] }, meta: { next_cursor: "n2" } })).toBe("n2")
    expect(nextCursor({ data: { items: [] } })).toBe("")
  })

  it("a refund can be at most what remains, and blank means the whole remainder", () => {
    const paid = { status: "succeeded", amount_paise: 25000, refunded_paise: 5000 }
    expect(refundRemaining(paid)).toBe(20000)
    expect(refundRemaining({ amount_paise: 100, refunded_paise: 150 })).toBe(0)
    expect(canRefund(paid)).toBe(true)
    expect(canRefund({ status: "partially_refunded", amount_paise: 25000, refunded_paise: 5000 })).toBe(true)
    expect(canRefund({ status: "refunded", amount_paise: 25000, refunded_paise: 25000 })).toBe(false)
    expect(canRefund({ status: "pending", amount_paise: 25000 })).toBe(false)
    expect(canRefund({ status: "failed", amount_paise: 25000 })).toBe(false)
    expect(checkRefund("", 20000)).toEqual({ ok: true, amountPaise: null })
    expect(checkRefund("200", 20000)).toEqual({ ok: true, amountPaise: 20000 })
    expect(checkRefund("199.99", 20000)).toEqual({ ok: true, amountPaise: 19999 })
    expect(checkRefund("200.01", 20000)).toEqual({ ok: false, problem: "At most ₹200.00 can still be refunded." })
    expect(checkRefund("0", 20000).ok).toBe(false)
    expect(checkRefund("-5", 20000).ok).toBe(false)
    expect(checkRefund("1.234", 20000).ok).toBe(false)
    expect(checkRefund("", 0).ok).toBe(false)
    expect(refundBody(null, "never arrived")).toEqual({ reason: "never arrived" })
    expect(refundBody(12500, "partly wrong")).toEqual({ amount_paise: 12500, reason: "partly wrong" })
  })
})
