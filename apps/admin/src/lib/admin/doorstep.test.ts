import { describe, expect, it } from "vitest"
import { ADMIN_APPS } from "./apps"
import {
  DECISION_BODIES,
  DOORSTEP,
  DOORSTEP_READS,
  DOORSTEP_REVEALS,
  DOORSTEP_STEP_UP_READS,
  DOORSTEP_VIEWER_UNAVAILABLE,
  doorstepViewErrorMessage,
  stepUpFor,
  DOORSTEP_WRITES,
  approvalBlockers,
  canCancelBooking,
  canRedispatch,
  checkAddonGroup,
  checkCancellationRule,
  checkCategory,
  checkCity,
  checkCommissionRule,
  checkDoorstepRefund,
  checkPrice,
  checkRateCard,
  checkService,
  checkSlotConfig,
  checkZone,
  documentApprovalWarning,
  doorstepReasonProblem,
  doorstepRequest,
  doorstepStepUp,
  doorstepTwoPerson,
  indiaTime,
  indiaToday,
  nextCursor,
  openPriceRow,
  percentToBps,
  policeClearUntil,
  priceHistory,
  proWrites,
  readReadiness,
  refundBody,
  refundRoom,
  sortDocumentQueue,
  type DoorstepWrite,
  type FormValues,
} from "./doorstep"
import { buildAdminNav, parseAdminMe } from "./me"
import { DOORSTEP_SECTIONS, adminPrefix, can, canReadStats, visibleSections } from "./sections"
import { statsView } from "./stats"

const navigation = ADMIN_APPS.map((app) => ({ app: app.id, label: app.label }))

function me(apps: Record<string, string[]>, platform: string[] = []) {
  const parsed = parseAdminMe({ data: { user_id: "u-1", permissions: { platform, apps }, mfa: { required: true, verified: true }, navigation } })
  if (!parsed) throw new Error("fixture did not parse")
  return parsed
}

const ids = (sections: { id: string }[]) => sections.map((s) => s.id)
const d = (perms: string[]) => me({ doorstep: perms.map((p) => `doorstep:${p}`) })

/** identity's doorstep roles (auth-service catalogue.go AppDoorstep), without admin and superadmin. */
const ROLE_PERMISSIONS: Record<string, string[]> = {
  moderator: ["catalogue.read", "pros.read", "bookings.read", "incidents.read", "incidents.act", "tickets.act", "ratings.moderate"],
  finance: ["catalogue.read", "bookings.read", "refunds.issue", "settlements.read", "stats.read"],
  support: ["catalogue.read", "pros.read", "bookings.read", "bookings.redispatch", "incidents.read", "incidents.act", "tickets.act", "stats.read"],
  kyc_reviewer: ["pros.read", "documents.review"],
  auditor: ["audit.read"],
}

const ID = "8a1f3c2e-1111-4222-8333-944455566677"

describe("Doorstep in the console's registries", () => {
  it("sits after Mopedu and before Trust & safety, at /doorstep, with stats on the header and the overview", () => {
    const order = ADMIN_APPS.map((a) => a.id)
    expect(order.indexOf("doorstep")).toBe(order.indexOf("rider") + 1)
    expect(order.indexOf("trust_safety")).toBe(order.indexOf("doorstep") + 1)
    expect(adminPrefix("doorstep")).toBe(DOORSTEP)
    const nav = buildAdminNav(d(["bookings.read"]))
    expect(nav.apps.map((g) => [g.label, g.href])).toEqual([["Doorstep", "/doorstep"]])
  })

  it("an admin with no doorstep permission has no Doorstep in the rail", () => {
    expect(buildAdminNav(me({ rider: ["rider:rides.read"] })).apps.map((g) => g.app)).toEqual(["rider"])
  })

  it("stats: the contract's AdminStats, money in paise, unknown never shown as zero", () => {
    const view = statsView("doorstep", { status: "ok", raw: { data: { unassigned_within_2h: 2, gmv_today_paise: 123456, incidents_open: 0 } } })
    const tile = (key: string) => view.tiles.find((t) => t.key === key)
    expect(tile("unassigned_within_2h")).toMatchObject({ display: "2", tone: "bad" })
    expect(tile("incidents_open")).toMatchObject({ display: "0", tone: "normal" })
    expect(tile("gmv_today_paise")?.display).toBe("₹1,234.56")
    expect(tile("documents_pending")?.display).toBe("unavailable")
    expect(view.tiles.map((t) => t.key)).toHaveLength(11)
  })
})

describe("Doorstep sections per permission set", () => {
  it("each identity role sees exactly the sections its permissions read", () => {
    const seen = Object.fromEntries(Object.entries(ROLE_PERMISSIONS).map(([role, perms]) => [role, ids(visibleSections(d(perms), "doorstep", DOORSTEP_SECTIONS))]))
    expect(seen).toEqual({
      moderator: ["professionals", "bookings", "incidents", "tickets", "ratings", "catalogue", "config"],
      finance: ["bookings", "catalogue", "config", "money"],
      support: ["professionals", "bookings", "incidents", "tickets", "catalogue", "config"],
      kyc_reviewer: ["approvals", "professionals"],
      auditor: ["audit"],
    })
  })

  it("stats only for finance and support (GMV is money), never the moderator", () => {
    expect(canReadStats(d(ROLE_PERMISSIONS.finance), "doorstep")).toBe(true)
    expect(canReadStats(d(ROLE_PERMISSIONS.support), "doorstep")).toBe(true)
    expect(canReadStats(d(ROLE_PERMISSIONS.moderator), "doorstep")).toBe(false)
  })

  it("a write-only permission without its read opens nothing it cannot list", () => {
    expect(ids(visibleSections(d(["bookings.cancel", "refunds.issue", "catalogue.write", "config.write", "pros.suspend"]), "doorstep", DOORSTEP_SECTIONS))).toEqual([])
    expect(ids(visibleSections(d(["pros.approve"]), "doorstep", DOORSTEP_SECTIONS))).toEqual(["approvals"])
  })

  it("a platform wildcard sees all ten; another app's admin sees none", () => {
    expect(ids(visibleSections(me({}, ["*"]), "doorstep", DOORSTEP_SECTIONS))).toEqual(DOORSTEP_SECTIONS.map((s) => s.id))
    expect(DOORSTEP_SECTIONS).toHaveLength(10)
    expect(visibleSections(me({ rider: ["rider:partners.read"] }), "doorstep", DOORSTEP_SECTIONS)).toEqual([])
  })

  it("buttons follow the write's own permission: support may re-dispatch but not cancel or refund", () => {
    const support = d(ROLE_PERMISSIONS.support)
    const holds = (w: DoorstepWrite) => can(support, "doorstep", DOORSTEP_WRITES[w].permission)
    expect(holds("booking.redispatch")).toBe(true)
    expect(holds("booking.cancel")).toBe(false)
    expect(holds("booking.refund")).toBe(false)
    expect(holds("incident.resolve")).toBe(true)
    expect(holds("price.create")).toBe(false)
    expect(can(d(ROLE_PERMISSIONS.finance), "doorstep", DOORSTEP_WRITES["booking.refund"].permission)).toBe(true)
  })
})

describe("every write's route and permission (contract x-permission)", () => {
  const t = { id: ID, code: "HYD", skill: "ac_service" }
  const table: [DoorstepWrite, "post" | "patch", string, string][] = [
    ["pro.approve", "post", `/professionals/${ID}/approve`, "pros.approve"],
    ["pro.reject", "post", `/professionals/${ID}/reject`, "pros.approve"],
    ["pro.suspend", "post", `/professionals/${ID}/suspend`, "pros.suspend"],
    ["pro.reinstate", "post", `/professionals/${ID}/reinstate`, "pros.suspend"],
    ["pro.block", "post", `/professionals/${ID}/block`, "pros.suspend"],
    ["skill.verify", "post", `/professionals/${ID}/skills/ac_service/verify`, "pros.approve"],
    ["skill.revoke", "post", `/professionals/${ID}/skills/ac_service/verify`, "pros.approve"],
    ["document.approve", "post", `/documents/${ID}/decide`, "documents.review"],
    ["document.reject", "post", `/documents/${ID}/decide`, "documents.review"],
    ["booking.cancel", "post", `/bookings/${ID}/cancel`, "bookings.cancel"],
    ["booking.redispatch", "post", `/bookings/${ID}/redispatch`, "bookings.redispatch"],
    ["booking.refund", "post", `/bookings/${ID}/refund`, "refunds.issue"],
    ["incident.acknowledge", "post", `/incidents/${ID}/acknowledge`, "incidents.act"],
    ["incident.resolve", "post", `/incidents/${ID}/resolve`, "incidents.act"],
    ["ticket.status", "post", `/tickets/${ID}/status`, "tickets.act"],
    ["rating.hide", "post", `/ratings/${ID}/hide`, "ratings.moderate"],
    ["category.create", "post", "/categories", "catalogue.write"],
    ["category.update", "patch", `/categories/${ID}`, "catalogue.write"],
    ["skill.create", "post", "/skills", "catalogue.write"],
    ["service.create", "post", "/services", "catalogue.write"],
    ["service.update", "patch", `/services/${ID}`, "catalogue.write"],
    ["option.create", "post", `/services/${ID}/options`, "catalogue.write"],
    ["option.update", "patch", `/options/${ID}`, "catalogue.write"],
    ["addon_group.create", "post", `/services/${ID}/addon-groups`, "catalogue.write"],
    ["addon_group.update", "patch", `/addon-groups/${ID}`, "catalogue.write"],
    ["addon.create", "post", `/addon-groups/${ID}/addons`, "catalogue.write"],
    ["addon.update", "patch", `/addons/${ID}`, "catalogue.write"],
    ["price.create", "post", "/prices", "catalogue.write"],
    ["rate_card.create", "post", "/rate-cards", "catalogue.write"],
    ["rate_card.update", "patch", `/rate-cards/${ID}`, "catalogue.write"],
    ["city.create", "post", "/cities", "config.write"],
    ["city.update", "patch", "/cities/HYD", "config.write"],
    ["zone.create", "post", "/zones", "config.write"],
    ["zone.update", "patch", `/zones/${ID}`, "config.write"],
    ["slot_config.create", "post", "/slot-configs", "config.write"],
    ["slot_config.update", "patch", `/slot-configs/${ID}`, "config.write"],
    ["cancellation_rule.create", "post", "/cancellation-rules", "config.write"],
    ["cancellation_rule.update", "patch", `/cancellation-rules/${ID}`, "config.write"],
    ["commission_rule.create", "post", "/commission-rules", "config.write"],
    ["commission_rule.update", "patch", `/commission-rules/${ID}`, "config.write"],
  ]

  it("covers every write exactly once", () => {
    expect(table.map(([w]) => w).sort()).toEqual((Object.keys(DOORSTEP_WRITES) as DoorstepWrite[]).sort())
  })

  it.each(table)("%s → %s /v1/admin/doorstep%s (%s)", (write, method, path, permission) => {
    const req = doorstepRequest(write, t)
    expect(req.method).toBe(method)
    expect(req.url).toBe(`${DOORSTEP}${path}`)
    expect(DOORSTEP_WRITES[write].permission).toBe(permission)
  })

  it("ids are encoded into the path, never spliced raw", () => {
    expect(doorstepRequest("booking.cancel", { id: "../x?y" }).url).toBe(`${DOORSTEP}/bookings/..%2Fx%3Fy/cancel`)
    expect(doorstepRequest("skill.verify", { id: ID, skill: "a/b" }).url).toBe(`${DOORSTEP}/professionals/${ID}/skills/a%2Fb/verify`)
  })

  it("every write sends an Idempotency-Key; the refund is the one the server requires", () => {
    const all = Object.keys(DOORSTEP_WRITES) as DoorstepWrite[]
    expect(all.filter((w) => doorstepRequest(w, t).idempotent !== true)).toEqual([])
    expect(all.filter((w) => DOORSTEP_WRITES[w].idempotencyRequired === true)).toEqual(["booking.refund"])
  })

  it("the bodies the contract asks for", () => {
    expect(DECISION_BODIES.document("approve", "")).toEqual({ decision: "approve" })
    expect(DECISION_BODIES.document("reject", "Blurred, unreadable scan")).toEqual({ decision: "reject", reason: "Blurred, unreadable scan" })
    expect(DECISION_BODIES.skill(false, "Certificate expired in 2024")).toEqual({ verified: false, reason: "Certificate expired in 2024" })
    expect(DECISION_BODIES.resolve("Customer safe, pro cleared", true)).toEqual({ resolution: "Customer safe, pro cleared", lift_suspension: true })
    expect(DECISION_BODIES.ticket("resolved", "")).toEqual({ status: "resolved" })
    expect(refundBody(5000, "Service not delivered", "extras")).toEqual({ amount_paise: 5000, reason: "Service not delivered", payment: "extras" })
  })
})

/**
 * admin-service's Doorstep table (Architecture/services/admin-service/
 * internal/http/handler_doorstep.go, commit 481321e3), as "METHOD path":
 * every route with stepUp: true, the one decided from the body, and the
 * two-person route. The console must match it exactly.
 */
const SERVER_STEP_UP = [
  "POST /prices",
  "POST /rate-cards",
  "PATCH /rate-cards/:id",
  "POST /cancellation-rules",
  "PATCH /cancellation-rules/:id",
  "POST /commission-rules",
  "PATCH /commission-rules/:id",
  "GET /professionals/:id",
  "POST /professionals/:id/suspend",
  "POST /professionals/:id/reinstate",
  "POST /professionals/:id/block",
  "GET /documents",
  "POST /documents/:id/decide",
  "POST /bookings/:id/cancel",
  "POST /bookings/:id/refund",
].sort()
const SERVER_STEP_UP_FROM_BODY = ["POST /incidents/:id/resolve (lift_suspension=true)"]
const SERVER_TWO_PERSON = ["POST /bookings/:id/refund"]

describe("the console's step-up and two-person set is admin-service's", () => {
  const all = Object.keys(DOORSTEP_WRITES) as DoorstepWrite[]
  const route = (w: DoorstepWrite) => `${DOORSTEP_WRITES[w].method.toUpperCase()} ${DOORSTEP_WRITES[w].path({ id: ":id", code: ":code", skill: ":code" }).slice(DOORSTEP.length).replace(/%3A/g, ":")}`
  const unique = (xs: string[]) => [...new Set(xs)].sort()

  it("step-up routes: the writes that always need it, plus the two step-up reads", () => {
    const writes = all.filter(doorstepStepUp).map(route)
    const reads = [`GET ${DOORSTEP_STEP_UP_READS.professional.path(":id").slice(DOORSTEP.length).replace(/%3A/g, ":")}`, `GET ${DOORSTEP_STEP_UP_READS.documents.path("").slice(DOORSTEP.length)}`]
    expect(unique([...writes, ...reads])).toEqual(SERVER_STEP_UP)
  })

  it("an incident resolve needs step-up only when it lifts the suspension", () => {
    expect(SERVER_STEP_UP_FROM_BODY).toHaveLength(1)
    expect(doorstepStepUp("incident.resolve")).toBe(false)
    expect(stepUpFor("incident.resolve", DECISION_BODIES.resolve("Cleared after a call", true))).toBe(true)
    expect(stepUpFor("incident.resolve", DECISION_BODIES.resolve("Cleared after a call", false))).toBe(false)
    expect(all.filter((w) => DOORSTEP_WRITES[w].stepUpWhen !== undefined)).toEqual(["incident.resolve"])
    expect(stepUpFor("booking.redispatch", { lift_suspension: true })).toBe(false)
  })

  it("two-person: the refund, always, with no threshold", () => {
    expect(unique(all.filter(doorstepTwoPerson).map(route))).toEqual(SERVER_TWO_PERSON)
    expect(stepUpFor("booking.refund", refundBody(1, "Smallest possible refund", "booking"))).toBe(true)
  })

  it("the step-up reads' URLs", () => {
    expect(DOORSTEP_STEP_UP_READS.professional.path(ID)).toBe(`${DOORSTEP}/professionals/${ID}`)
    expect(DOORSTEP_STEP_UP_READS.documents.path("pending")).toBe(`${DOORSTEP}/documents?status=pending`)
    expect(DOORSTEP_STEP_UP_READS.documents.path("everything")).toBe(`${DOORSTEP}/documents`)
  })
})

describe("step-up, two-person and reasons", () => {
  const all = Object.keys(DOORSTEP_WRITES) as DoorstepWrite[]

  it("step-up: account actions, document decisions, ops cancel, refunds and every money setting", () => {
    expect(all.filter(doorstepStepUp)).toEqual([
      "pro.suspend",
      "pro.reinstate",
      "pro.block",
      "document.approve",
      "document.reject",
      "booking.cancel",
      "booking.refund",
      "price.create",
      "rate_card.create",
      "rate_card.update",
      "cancellation_rule.create",
      "cancellation_rule.update",
      "commission_rule.create",
      "commission_rule.update",
    ])
    for (const w of all.filter(doorstepStepUp)) expect(DOORSTEP_WRITES[w].explain).toMatch(/fresh 2FA code/)
  })

  it("two-person: the refund, and only the refund", () => {
    expect(all.filter(doorstepTwoPerson)).toEqual(["booking.refund"])
    expect(DOORSTEP_WRITES["booking.refund"].explain).toMatch(/second admin/)
  })

  it("a reason is required for every destructive write, and for re-dispatch, reinstate and resolve", () => {
    const needing = all.filter((w) => DOORSTEP_WRITES[w].reason)
    expect(needing).toEqual(["pro.reject", "pro.suspend", "pro.reinstate", "pro.block", "skill.revoke", "document.reject", "booking.cancel", "booking.redispatch", "booking.refund", "incident.resolve", "rating.hide"])
    for (const w of all.filter((x) => DOORSTEP_WRITES[x].destructive)) expect(DOORSTEP_WRITES[w].reason).toBe(true)
  })

  it("an empty or short reason is refused; ten characters pass; optional writes take none", () => {
    expect(doorstepReasonProblem("pro.block", "")).toMatch(/required/)
    expect(doorstepReasonProblem("booking.cancel", "too short")).toMatch(/at least 10/)
    expect(doorstepReasonProblem("booking.redispatch", "Pro unreachable for 30 min")).toBeNull()
    expect(doorstepReasonProblem("pro.approve", "")).toBeNull()
    expect(doorstepReasonProblem("incident.acknowledge", "")).toBeNull()
  })
})

describe("reads", () => {
  it("builds each list URL, leaving out what cannot be sent", () => {
    expect(DOORSTEP_READS.professionals({ status: "pending_verification", city: "hyd" }, "c1")).toBe(`${DOORSTEP}/professionals?status=pending_verification&city=HYD&cursor=c1`)
    expect(DOORSTEP_READS.professionals({ status: "", city: "Hyderabad" })).toBe(`${DOORSTEP}/professionals`)
    expect(DOORSTEP_READS.bookings({ status: "confirmed", city: "HYD", date: "2026-10-05" })).toBe(`${DOORSTEP}/bookings?status=confirmed&city=HYD&date=2026-10-05`)
    expect(DOORSTEP_READS.bookings({ date: "5 Oct" })).toBe(`${DOORSTEP}/bookings`)
    expect(DOORSTEP_READS.prices("HYD", ID)).toBe(`${DOORSTEP}/prices?city=HYD&item_id=${ID}`)
    expect(DOORSTEP_READS.rateCards("HYD", "not-a-uuid")).toBe(`${DOORSTEP}/rate-cards?city=HYD`)
    expect(DOORSTEP_READS.audit("city_price", 500)).toBe(`${DOORSTEP}/audit-logs?entity=city_price&limit=100`)
    expect(DOORSTEP_READS.audit("drop table;")).toBe(`${DOORSTEP}/audit-logs?limit=50`)
    expect(DOORSTEP_READS.settlements("2026-10-01")).toBe(`${DOORSTEP}/settlements?period_start=2026-10-01`)
    expect(DOORSTEP_READS.stats()).toBe(`${DOORSTEP}/stats`)
  })

  it("a document image is a step-up reveal of its own (bytes, never a URL)", () => {
    expect(DOORSTEP_REVEALS.documentView.path(ID)).toBe(`${DOORSTEP}/documents/${ID}/view`)
    expect(DOORSTEP_REVEALS.documentView.permission).toBe("documents.review")
  })

  it("a 404 from the image route says the viewer is not available yet; other failures keep their sentence", () => {
    expect(doorstepViewErrorMessage({ status: 404, message: "This document is no longer available." })).toBe(DOORSTEP_VIEWER_UNAVAILABLE)
    expect(DOORSTEP_VIEWER_UNAVAILABLE).toMatch(/not available yet/)
    expect(doorstepViewErrorMessage({ status: 403, message: "You don't have permission to view KYC documents." })).toBe("You don't have permission to view KYC documents.")
    expect(doorstepViewErrorMessage({ status: null, message: "This document could not be shown." })).toBe("This document could not be shown.")
  })

  it("reads the cursor from the envelope", () => {
    expect(nextCursor({ data: { items: [], next_cursor: "abc" } })).toBe("abc")
    expect(nextCursor({ data: { items: [], next_cursor: null } })).toBe("")
  })
})

describe("professionals and approvals", () => {
  it("offers only the decisions the status allows", () => {
    expect(proWrites("pending_verification")).toEqual(["pro.approve", "pro.reject", "pro.block"])
    expect(proWrites("draft")).toEqual(["pro.reject", "pro.block"])
    expect(proWrites("approved")).toEqual(["pro.suspend", "pro.block"])
    expect(proWrites("suspended")).toEqual(["pro.reinstate", "pro.block"])
    expect(proWrites("blocked")).toEqual([])
    expect(proWrites(undefined)).toEqual([])
  })

  it("Approve waits for every required onboarding step; PAN is only recommended", () => {
    const detail = { readiness: { status: "pending_verification", missing_steps: ["police_certificate", "pan"], completed_steps: ["profile"], recommended_steps: ["pan"], can_go_on_duty: false } }
    expect(approvalBlockers(detail)).toEqual(["Police clearance certificate"])
    expect(approvalBlockers({ readiness: { missing_steps: ["pan"], completed_steps: [] } })).toEqual([])
    expect(approvalBlockers({})).toEqual(["The onboarding readiness could not be read."])
    expect(readReadiness(detail)).toMatchObject({ missing: ["police_certificate", "pan"], completed: ["profile"], canGoOnDuty: false })
  })

  it("a police certificate clears the check for 12 months from issue", () => {
    expect(policeClearUntil("2026-03-15")).toBe("2027-03-15")
    expect(policeClearUntil("2024-02-29")).toBe("2025-03-01")
    expect(policeClearUntil(null)).toBeNull()
    expect(policeClearUntil("15/03/2026")).toBeNull()
  })

  it("warns before approving a stale or undated police certificate, never for other documents", () => {
    expect(documentApprovalWarning({ kind: "police_certificate", issued_on: "2025-09-01" }, "2026-10-04")).toMatch(/more than 12 months/)
    expect(documentApprovalWarning({ kind: "police_certificate", issued_on: null }, "2026-10-04")).toMatch(/no issue date/)
    expect(documentApprovalWarning({ kind: "police_certificate", issued_on: "2026-01-10" }, "2026-10-04")).toBeNull()
    expect(documentApprovalWarning({ kind: "pan", issued_on: null }, "2026-10-04")).toBeNull()
  })

  it("queues police certificates first, then oldest first", () => {
    const rows = [
      { id: "a", kind: "pan", created_at: "2026-10-01T00:00:00Z" },
      { id: "b", kind: "police_certificate", created_at: "2026-10-03T00:00:00Z" },
      { id: "c", kind: "other", created_at: "2026-09-30T00:00:00Z" },
      { id: "d", kind: "police_certificate", created_at: "2026-10-02T00:00:00Z" },
    ]
    expect(sortDocumentQueue(rows).map((r) => r.id)).toEqual(["d", "b", "c", "a"])
  })

  it("today is India's date", () => {
    expect(indiaToday(new Date("2026-10-04T20:00:00Z"))).toBe("2026-10-05")
    expect(indiaToday(new Date("2026-10-04T18:00:00Z"))).toBe("2026-10-04")
  })
})

describe("bookings", () => {
  it("ops cancel until the visit starts; re-dispatch only before the visit begins", () => {
    expect(["pending_payment", "confirmed", "assigned", "en_route", "arrived"].every(canCancelBooking)).toBe(true)
    expect(["in_progress", "awaiting_extras_payment", "completed", "cancelled", "expired", "pro_no_show"].some(canCancelBooking)).toBe(false)
    expect(["confirmed", "assigned", "en_route"].every(canRedispatch)).toBe(true)
    expect(["pending_payment", "arrived", "in_progress", "completed"].some(canRedispatch)).toBe(false)
  })

  const detail = {
    payments: [
      { payment_id: "p1", reference_type: "doorstep_booking", amount_paise: 99900, status: "partially_refunded" },
      { payment_id: "p2", reference_type: "doorstep_extras", amount_paise: 45000, status: "succeeded" },
      { payment_id: "p3", reference_type: "doorstep_extras", amount_paise: 10000, status: "failed" },
    ],
    refunds: [
      { payment_id: "p1", amount_paise: 20000, status: "succeeded" },
      { payment_id: "p1", amount_paise: 5000, status: "failed" },
      { payment_id: "p2", amount_paise: 45000, status: "requested" },
    ],
  }

  it("refund room: captured payments of the kind, less refunds that have not failed", () => {
    expect(refundRoom(detail, "booking")).toBe(79900)
    expect(refundRoom(detail, "extras")).toBe(0)
    expect(refundRoom(null, "booking")).toBe(0)
  })

  it("the refund amount is required, positive, and within the room", () => {
    expect(checkDoorstepRefund("", 79900)).toMatchObject({ ok: false })
    expect(checkDoorstepRefund("0", 79900)).toMatchObject({ ok: false })
    expect(checkDoorstepRefund("799.01", 79900)).toEqual({ ok: false, problem: "At most ₹799.00 can still be refunded." })
    expect(checkDoorstepRefund("799", 79900)).toEqual({ ok: true, amountPaise: 79900 })
    expect(checkDoorstepRefund("100", 0)).toEqual({ ok: false, problem: "Nothing is left to refund on this payment." })
  })
})

describe("prices: a new row, never an edit", () => {
  it("there is no route that edits a price: price.create is the only price write, and it is a POST", () => {
    const priceWrites = (Object.keys(DOORSTEP_WRITES) as DoorstepWrite[]).filter((w) => w.startsWith("price."))
    expect(priceWrites).toEqual(["price.create"])
    expect(DOORSTEP_WRITES["price.create"].method).toBe("post")
    expect(doorstepRequest("price.create", { id: ID }).url).toBe(`${DOORSTEP}/prices`)
  })

  const now = new Date("2026-10-04T06:00:00Z")
  const open = { id: "r2", city_code: "HYD", item_id: ID, price_paise: 49900, effective_from: "2026-09-01T00:00:00+05:30", effective_to: null }
  const closed = { id: "r1", city_code: "HYD", item_id: ID, price_paise: 44900, effective_from: "2026-08-01T00:00:00+05:30", effective_to: "2026-09-01T00:00:00+05:30" }
  const base: FormValues = { city_code: "hyd", item_kind: "option", item_id: ID, price: "549", mrp: "", effective_from: "" }

  it("finds the open row and orders the history newest first", () => {
    expect(openPriceRow([closed, open], "HYD", ID)).toBe(open)
    expect(openPriceRow([closed], "HYD", ID)).toBeNull()
    expect(priceHistory([closed, open]).map((r) => r.id)).toEqual(["r2", "r1"])
  })

  it("a blank start means now; the body is paise, GST-inclusive", () => {
    expect(checkPrice(base, open, now)).toEqual({ ok: true, body: { city_code: "HYD", item_kind: "option", item_id: ID, price_paise: 54900 } })
  })

  it("refuses a start in the past or not after the open row's start", () => {
    const past = checkPrice({ ...base, effective_from: "2026-10-01" }, open, now)
    expect(past.ok).toBe(false)
    if (!past.ok) expect(past.problems.join(" ")).toMatch(/cannot start in the past/)
    const beforeOpen = checkPrice({ ...base, effective_from: "2026-10-10" }, { ...open, effective_from: "2026-11-01T00:00:00+05:30" }, now)
    expect(beforeOpen.ok).toBe(false)
    if (!beforeOpen.ok) expect(beforeOpen.problems.join(" ")).toMatch(/after the current price's start/)
    expect(checkPrice({ ...base, effective_from: "2026-10-10T09:30" }, open, now)).toMatchObject({ ok: true, body: { effective_from: "2026-10-10T09:30:00+05:30" } })
  })

  it("refuses a zero price, an MRP below the price, a bad city or item", () => {
    const bad = checkPrice({ city_code: "Hyderabad", item_kind: "service", item_id: "x", price: "0", mrp: "100" }, null, now)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.problems).toHaveLength(4)
    const mrp = checkPrice({ ...base, mrp: "499" }, null, now)
    expect(mrp.ok).toBe(false)
    if (!mrp.ok) expect(mrp.problems).toEqual(["MRP cannot be below the price."])
  })
})

describe("catalogue and config forms", () => {
  it("salon categories are gendered and take catalogue add-ons only", () => {
    const salon: FormValues = { slug: "salon-women", name: "Salon for women", family: "BEAUTY_SALON", gender_rule: "any", extras_policy: "rate_card", active: false }
    const bad = checkCategory(salon)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.problems).toHaveLength(2)
    expect(checkCategory({ ...salon, gender_rule: "female_pros_only", extras_policy: "catalogue_addons_only" })).toMatchObject({ ok: true, body: { family: "BEAUTY_SALON", gender_rule: "female_pros_only" } })
    expect(checkCategory({ slug: "AC Repair", name: "AC", family: "X" }).ok).toBe(false)
  })

  it("a service is always one professional and between 15 minutes and 12 hours", () => {
    const ok = checkService({ category_id: ID, slug: "ac-service", name: "AC service", duration_minutes: "60", required_skill: "ac_service", inclusions: "Filter clean\n\nCoil wash", active: true })
    expect(ok).toMatchObject({ ok: true, body: { crew_size: 1, duration_minutes: 60, inclusions: ["Filter clean", "Coil wash"] } })
    expect(checkService({ category_id: ID, slug: "x", name: "Too quick", duration_minutes: "10", required_skill: "ac_service" }).ok).toBe(false)
  })

  it("add-on groups: min not above max, a required group needs a pick", () => {
    expect(checkAddonGroup({ name: "Extras", min_select: "2", max_select: "1" }).ok).toBe(false)
    expect(checkAddonGroup({ name: "Extras", min_select: "0", max_select: "1", is_required: true }).ok).toBe(false)
    expect(checkAddonGroup({ name: "Extras", min_select: "1", max_select: "3", is_required: true })).toMatchObject({ ok: true, body: { min_select: 1, max_select: 3 } })
  })

  it("rate cards: create needs everything; an edit sends only what changed", () => {
    expect(checkRateCard({ city_code: "HYD", category_id: ID, code: "gas_refill", name: "Gas refill", unit: "per_item", price: "1800" })).toMatchObject({ ok: true, body: { price_paise: 180000, unit: "per_item" } })
    expect(checkRateCard({ price: "2000" }, { partial: true })).toEqual({ ok: true, body: { price_paise: 200000 } })
    expect(checkRateCard({}, { partial: true })).toEqual({ ok: false, problems: ["Change at least one field."] })
  })

  it("cities: three capital letters and a GST state code; an edit cannot change the code", () => {
    expect(checkCity({ code: "hyd", name: "Hyderabad", state_code: "36", extras_threshold: "3000" })).toMatchObject({ ok: true, body: { code: "HYD", state_code: "36", extras_charge_now_threshold_paise: 300000 } })
    expect(checkCity({ code: "HYDE", name: "H", state_code: "Telangana" }).ok).toBe(false)
    const edit = checkCity({ code: "BLR", max_jobs_per_day: "8" }, { partial: true })
    expect(edit).toEqual({ ok: true, body: { max_jobs_per_day: 8 } })
  })

  it("zones take GeoJSON polygons only", () => {
    const boundary = JSON.stringify({ type: "Polygon", coordinates: [[[78.38, 17.44], [78.4, 17.44], [78.4, 17.46], [78.38, 17.44]]] })
    expect(checkZone({ city_code: "HYD", name: "Madhapur", slug: "madhapur", boundary, active: true })).toMatchObject({ ok: true, body: { boundary: { type: "Polygon" } } })
    expect(checkZone({ city_code: "HYD", name: "Madhapur", slug: "madhapur", boundary: "POLYGON((1 2, 3 4))" }).ok).toBe(false)
    expect(checkZone({ city_code: "HYD", name: "Madhapur", slug: "madhapur", boundary: JSON.stringify({ type: "Point", coordinates: [1, 2] }) }).ok).toBe(false)
  })

  it("slot configs: closing after opening, steps within bounds", () => {
    expect(checkSlotConfig({ city_code: "HYD", open_time: "08:00", close_time: "20:00", slot_step_minutes: "30" })).toMatchObject({ ok: true, body: { open_time: "08:00", close_time: "20:00", slot_step_minutes: 30 } })
    expect(checkSlotConfig({ city_code: "HYD", open_time: "20:00", close_time: "08:00" }).ok).toBe(false)
    expect(checkSlotConfig({ hold_minutes: "0" }, { partial: true }).ok).toBe(false)
  })

  it("cancellation rules: a free rule is 0, not blank; a forbidden stage charges nothing", () => {
    expect(checkCancellationRule({ city_code: "HYD", stage: "assigned", minutes_before_lt: "180", fee: "75", allowed: true })).toMatchObject({ ok: true, body: { fee_paise: 7500, minutes_before_lt: 180 } })
    expect(checkCancellationRule({ city_code: "HYD", stage: "unassigned", fee: "0", allowed: true })).toMatchObject({ ok: true, body: { fee_paise: 0 } })
    expect(checkCancellationRule({ city_code: "HYD", stage: "unassigned", fee: "" }).ok).toBe(false)
    expect(checkCancellationRule({ city_code: "HYD", stage: "in_progress", fee: "200", allowed: false }).ok).toBe(false)
  })

  it("commission: 0–50 per cent as basis points, an end after the start", () => {
    expect(percentToBps("15")).toBe(1500)
    expect(percentToBps("12.5%")).toBe(1250)
    expect(percentToBps("51")).toBeNull()
    expect(percentToBps("-1")).toBeNull()
    expect(checkCommissionRule({ city_code: "HYD", percent: "15", effective_from: "2026-11-01", effective_to: "2026-10-01" }).ok).toBe(false)
    expect(checkCommissionRule({ effective_to: "2026-12-31" }, { partial: true })).toEqual({ ok: true, body: { effective_to: "2026-12-31T00:00:00+05:30" } })
  })

  it("India time from a date or a local date-time", () => {
    expect(indiaTime("2026-10-05")).toBe("2026-10-05T00:00:00+05:30")
    expect(indiaTime("2026-10-05T14:30")).toBe("2026-10-05T14:30:00+05:30")
    expect(indiaTime("tomorrow")).toBeNull()
  })
})
