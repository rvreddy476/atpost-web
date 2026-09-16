import { describe, expect, it } from "vitest"
import { ADMIN_APPS } from "./apps"
import { readList } from "./data"
import { buildAdminNav, parseAdminMe } from "./me"
import { REFUND_TWO_PERSON_THRESHOLD_PAISE, formatPaise, parseRupeeInput, refundHint, refundNeedsSecondApprover } from "./money"
import { IDEMPOTENCY_HEADER, prepareSend, runAdminMutation, type AdminWrite, type SentResponse } from "./mutation"
import {
  COMMERCE_SECTIONS,
  DATING_SECTIONS,
  FOOD_SECTIONS,
  TRUST_SECTIONS,
  can,
  canReadStats,
  visibleSections,
} from "./sections"
import { UNAVAILABLE, statsView } from "./stats"

const navigation = ADMIN_APPS.map((app) => ({ app: app.id, label: app.label }))

function me(apps: Record<string, string[]>, platform: string[] = []) {
  const parsed = parseAdminMe({
    data: {
      user_id: "u-1",
      permissions: { platform, apps },
      mfa: { required: true, verified: true },
      navigation,
    },
  })
  if (!parsed) throw new Error("fixture did not parse")
  return parsed
}

const ids = (sections: { id: string }[]) => sections.map((s) => s.id)

describe("sections for a permission set", () => {
  it("shows a Dating moderator only the queues their permissions cover", () => {
    const m = me({ dating: ["dating:reports.read", "dating:reports.act", "dating:photos.review"] })
    expect(ids(visibleSections(m, "dating", DATING_SECTIONS))).toEqual(["reports", "photos"])
    expect(can(m, "dating", "users.ban")).toBe(false)
    expect(canReadStats(m, "dating")).toBe(false)
    expect(visibleSections(m, "food", FOOD_SECTIONS)).toEqual([])
    expect(visibleSections(m, "trust_safety", TRUST_SECTIONS)).toEqual([])
  })

  it("shows a Feast section for any one of its permissions", () => {
    const m = me({ food: ["food:refund.issue", "food:settlement.mark_paid", "food:stats.read"] })
    expect(ids(visibleSections(m, "food", FOOD_SECTIONS))).toEqual(["refunds", "settlements"])
    expect(canReadStats(m, "food")).toBe(true)
  })

  it("gives a platform wildcard every section, and nothing leaks across apps", () => {
    const all = me({}, ["*"])
    expect(ids(visibleSections(all, "trust_safety", TRUST_SECTIONS))).toEqual(TRUST_SECTIONS.map((s) => s.id))
    const commerceOnly = me({ commerce: ["commerce:banners.edit", "commerce:cod.settle"] })
    expect(ids(visibleSections(commerceOnly, "commerce", COMMERCE_SECTIONS))).toEqual(["banners", "cod"])
    expect(visibleSections(commerceOnly, "dating", DATING_SECTIONS)).toEqual([])
  })

  it("links Trust & safety at /trust and offers Sellers to a sellers.read holder", () => {
    const m = me({ trust_safety: ["trust_safety:appeals.act"], commerce: ["commerce:sellers.read"] })
    const nav = buildAdminNav(m)
    expect(nav.apps.find((g) => g.app === "trust_safety")?.href).toBe("/trust")
    expect(nav.apps.find((g) => g.app === "commerce")?.links.map((l) => l.id)).toEqual(["sellers"])
  })
})

describe("refund two-person hint", () => {
  it("is ₹5,000", () => {
    expect(REFUND_TWO_PERSON_THRESHOLD_PAISE).toBe(500_000)
    expect(formatPaise(REFUND_TWO_PERSON_THRESHOLD_PAISE)).toBe("₹5,000.00")
  })

  it("applies AT the threshold, not only above it", () => {
    expect(refundNeedsSecondApprover(499_999)).toBe(false)
    expect(refundNeedsSecondApprover(500_000)).toBe(true)
    expect(refundNeedsSecondApprover(500_001)).toBe(true)
    expect(refundNeedsSecondApprover(parseRupeeInput("5000") ?? 0)).toBe(true)
    expect(refundNeedsSecondApprover(parseRupeeInput("4,999.99") ?? 0)).toBe(false)
  })

  it("tells the admin before sending, at the boundary and for full refunds", () => {
    expect(refundHint(500_000).secondApprover).toBe(true)
    expect(refundHint(500_000).message).toMatch(/second admin/)
    expect(refundHint(499_999).secondApprover).toBe(false)
    expect(refundHint(null, 500_000).secondApprover).toBe(true)
    expect(refundHint(null, 12_000).secondApprover).toBe(false)
    expect(refundHint(null, null).secondApprover).toBeNull()
    expect(refundHint(100, 900_000).secondApprover).toBe(false)
  })

  it("reads typed rupees as integer paise", () => {
    expect(parseRupeeInput("₹5,000")).toBe(500_000)
    expect(parseRupeeInput("4999.5")).toBe(499_950)
    expect(parseRupeeInput("0.07")).toBe(7)
    expect(parseRupeeInput("0")).toBeNull()
    expect(parseRupeeInput("12.345")).toBeNull()
    expect(parseRupeeInput("-5")).toBeNull()
    expect(parseRupeeInput("abc")).toBeNull()
  })
})

describe("Idempotency-Key across a step-up retry", () => {
  const stepUpError = { response: { status: 403, data: { error: { code: "STEP_UP_REQUIRED" } } } }

  it("sends the same key on the first attempt and the retry", async () => {
    const seen: (string | undefined)[] = []
    let calls = 0
    const request: AdminWrite = { method: "post", url: "/v1/admin/food/orders/o-1/refund", body: { amount_paise: 1 }, idempotent: true }
    let n = 0
    const { send, idempotencyKey } = prepareSend(
      request,
      async ({ headers }) => {
        seen.push(headers[IDEMPOTENCY_HEADER])
        calls += 1
        if (calls === 1) throw stepUpError
        return { status: 200, data: { data: {} } } satisfies SentResponse
      },
      () => `key-${++n}`,
    )
    const outcome = await runAdminMutation(send, async () => true)
    expect(outcome.kind).toBe("done")
    expect(seen).toEqual(["key-1", "key-1"])
    expect(idempotencyKey).toBe("key-1")
  })

  it("mints a new key for a new action, and none for a route that needs none", () => {
    let n = 0
    const makeKey = () => `key-${++n}`
    const transport = async () => ({ status: 200, data: null })
    const req: AdminWrite = { method: "post", url: "/x", idempotent: true }
    expect(prepareSend(req, transport, makeKey).idempotencyKey).toBe("key-1")
    expect(prepareSend(req, transport, makeKey).idempotencyKey).toBe("key-2")
    expect(prepareSend({ method: "post", url: "/x" }, transport, makeKey).idempotencyKey).toBeNull()
  })

  it("mints a real UUID by default", () => {
    const { idempotencyKey } = prepareSend({ method: "post", url: "/x", idempotent: true }, async () => ({ status: 200, data: null }))
    expect(idempotencyKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe("overview stats", () => {
  it("never shows 0 for a failed stats call", () => {
    const view = statsView("trust_safety", { status: "error", message: "boom" }, 4)
    expect(view.state).toBe("unavailable")
    expect(view.tiles).toHaveLength(4)
    for (const tile of view.tiles) {
      expect(tile.value).toBeNull()
      expect(tile.display).toBe(UNAVAILABLE)
      expect(tile.display).not.toBe("0")
    }
  })

  it("treats an unreadable body or a missing field as unavailable, and a real 0 as 0", () => {
    expect(statsView("dating", { status: "ok", raw: "<html>" }).state).toBe("unavailable")
    const view = statsView("dating", { status: "ok", raw: { data: { panic_open: 0, reports_pending: 3 } } })
    const byKey = Object.fromEntries(view.tiles.map((t) => [t.key, t]))
    expect(byKey.panic_open.display).toBe("0")
    expect(byKey.panic_open.tone).toBe("normal")
    expect(byKey.reports_pending.tone).toBe("warn")
    expect(byKey.photos_pending_review.display).toBe(UNAVAILABLE)
  })

  it("orders the most urgent numbers first and highlights overdue grievances", () => {
    const view = statsView("trust_safety", { status: "ok", raw: { data: { grievances_overdue: 2, grievances_due_within_48h: 5 } } }, 2)
    expect(view.tiles.map((t) => [t.key, t.tone])).toEqual([
      ["grievances_overdue", "bad"],
      ["grievances_due_within_48h", "warn"],
    ])
    expect(statsView("dating", { status: "loading" }, 1).tiles[0].key).toBe("panic_open")
    expect(statsView("food", { status: "ok", raw: { data: { gmv_today_paise: 123456 } } }).tiles.find((t) => t.key === "gmv_today_paise")?.display).toBe(
      "₹1,234.56",
    )
  })
})

describe("readList", () => {
  it("reads every list shape the services send, and null as empty", () => {
    expect(readList({ data: { items: [{ id: 1 }] } })).toEqual([{ id: 1 }])
    expect(readList({ data: [{ id: 2 }, "x"] })).toEqual([{ id: 2 }])
    expect(readList({ data: { refunds: [{ id: 3 }] } })).toEqual([{ id: 3 }])
    expect(readList({ data: { items: null } })).toEqual([])
    expect(readList({ data: null })).toEqual([])
  })
})

describe("approval details shown before deciding", () => {
  it("shows what, for how much, who asked and why — and never the idempotency key", async () => {
    const { approvalDetails, parseApprovals } = await import("./approvals")
    const [item] = parseApprovals(
      {
        data: {
          items: [
            {
              id: "ap-1",
              status: "pending",
              app: "food",
              operation: "food.order.refund",
              target_type: "food_order",
              target_id: "o-1",
              payload: { order_id: "o-1", amount_paise: 500000, idempotency_key: "secret-key" },
              required_permission: "food:refund.issue",
              summary: "Refund Feast order o-1 for ₹5,000.00",
              requested_by: "u-2",
              requested_at: "2026-09-16T09:00:00Z",
              reason: "Cold food",
            },
          ],
        },
      },
      "u-1",
    )
    const details = Object.fromEntries(approvalDetails(item))
    expect(details.Amount).toBe("₹5,000.00")
    expect(details["Requested by"]).toBe("u-2")
    expect(details["Their reason"]).toBe("Cold food")
    expect(details.Target).toBe("food_order o-1")
    expect(JSON.stringify(details)).not.toContain("secret-key")
    const full = approvalDetails({ ...item, payload: { order_id: "o-1" } })
    expect(Object.fromEntries(full).Amount).toMatch(/Full refund/)
  })
})
