import { describe, expect, it } from "vitest"
import { moneyPayloadRows } from "./approvals"
import { buildAdminNav, hasAppAccess, parseAdminMe } from "./me"
import {
  MONETIZATION_ALWAYS_TWO_PERSON,
  NOT_LAUNCHED_BODY,
  NOT_LAUNCHED_TITLE,
  NOT_REPORTED_BODY,
  NOT_REPORTED_TITLE,
  isNotLaunched,
  isNotLaunchedError,
  isPeriodKey,
  monetizationRefundHint,
  monetizationStatsView,
  monetizationStepUp,
  monetizationTwoPerson,
  type MonetizationWrite,
} from "./monetization"
import { adminErrorMessage } from "./mutation"
import {
  acceptApplication,
  applicationChoices,
  initialApplication,
  paymentsCan,
  paymentsQuery,
  paymentsScope,
  paymentsStatsView,
  resolveHint,
  resolveNeedsSecondApprover,
  visiblePaymentsSections,
} from "./payments"
import { MONETIZATION_SECTIONS, PAYMENTS_SECTIONS, visibleSections } from "./sections"

type Nav = { app: string; label: string; applications?: string[] }

function me(apps: Record<string, string[]>, platform: string[] = [], navigation?: Nav[]) {
  const parsed = parseAdminMe({
    data: {
      user_id: "u-1",
      permissions: { platform, apps },
      mfa: { required: true, verified: true },
      navigation: navigation ?? [
        { app: "monetization", label: "Monetization" },
        { app: "payments", label: "Payments" },
        { app: "food", label: "Feast" },
      ],
    },
  })
  if (!parsed) throw new Error("fixture did not parse")
  return parsed
}

const ids = (sections: { id: string }[]) => sections.map((s) => s.id)
const notLaunchedRead = { data: { state: "not_launched", app: "monetization", code: "MONETIZATION_NOT_LAUNCHED", message: "Monetization is not launched" } }

describe("monetization during the beta: reads work, writes are off", () => {
  it("renders real numbers from a successful read even while money actions are switched off", () => {
    // The stats route answers with data during the beta (2026-09-17); nothing on the page blocks it.
    const view = monetizationStatsView({ status: "ok", raw: { data: { open_fraud_reviews: 3, open_disputes: 0, frozen_wallets: 1, pending_payout_requests: 2 } } })
    expect(view.state).toBe("ok")
    expect(view.tiles.find((t) => t.key === "open_fraud_reviews")).toMatchObject({ display: "3", tone: "bad" })
    expect(view.tiles.find((t) => t.key === "open_disputes")).toMatchObject({ display: "0", tone: "normal" })
    expect(JSON.stringify(view)).not.toContain(NOT_LAUNCHED_TITLE)
  })

  it("still handles a read that answers {state: not_launched} gracefully: not reported, no tiles, never zeros", () => {
    // Reads no longer answer this during the beta, but if it ever appears again it must not read as zeros or a fault.
    const view = monetizationStatsView({ status: "ok", raw: notLaunchedRead })
    expect(view.state).toBe("not_launched")
    expect(view.tiles).toEqual([])
    expect(view.message).toBe(NOT_REPORTED_BODY)
    expect(view.message).not.toContain(NOT_LAUNCHED_TITLE)
    expect(NOT_REPORTED_TITLE).toBe("Numbers not reported yet")
    const text = JSON.stringify(view)
    expect(text).not.toMatch(/₹0|"0"|display":"0/)
  })

  it("tells a not-launched list from an empty one", () => {
    expect(isNotLaunched(notLaunchedRead)).toBe(true)
    expect(isNotLaunched({ data: [] })).toBe(false)
    expect(isNotLaunched({ data: null })).toBe(false)
  })

  it("reads a 503 write as not launched and explains it calmly, on the action", () => {
    const err = { response: { status: 503, data: { error: { code: "MONETIZATION_NOT_LAUNCHED", message: "x", details: { state: "not_launched" } } } } }
    expect(isNotLaunchedError(err)).toBe(true)
    expect(adminErrorMessage(err)).toBe("Money actions are switched off for the beta, so nothing was done.")
    expect(NOT_LAUNCHED_TITLE).toBe("Money actions are switched off for the beta")
    expect(NOT_LAUNCHED_BODY).toMatch(/Nothing was done/)
    expect(NOT_LAUNCHED_BODY).toMatch(/Reads still work/)
    expect(isNotLaunchedError({ response: { status: 503, data: { error: { code: "MAINTENANCE" } } } })).toBe(false)
  })

  it("shows unavailable, not 0, when stats fail or a field is missing", () => {
    const failed = monetizationStatsView({ status: "error", message: "boom" })
    expect(failed.state).toBe("unavailable")
    expect(failed.tiles.every((t) => t.display === "unavailable")).toBe(true)
    const partial = monetizationStatsView({ status: "ok", raw: { data: { open_fraud_reviews: 3 } } })
    expect(partial.tiles.find((t) => t.key === "open_fraud_reviews")).toMatchObject({ display: "3", tone: "bad" })
    expect(partial.tiles.find((t) => t.key === "frozen_wallets")?.display).toBe("unavailable")
  })

  it("reads a launched stats answer, the period against its cap and the last run", () => {
    const view = monetizationStatsView({
      status: "ok",
      raw: {
        data: {
          open_fraud_reviews: 0,
          open_disputes: 2,
          frozen_wallets: 1,
          pending_payout_requests: 4,
          pending_payout_paise: 1_250_000,
          current_period: { period_key: "2026-09", accrued_paise: 50_000, cap_paise: 100_000, capped: false },
          reversals_last_7_days: 0,
          last_settlement_run: { status: "failed", period_key: "2026-08", started_at: "2026-09-01T00:00:00Z" },
          generated_at: "2026-09-16T10:00:00Z",
        },
      },
    })
    const tile = (k: string) => view.tiles.find((t) => t.key === k)
    expect(tile("open_fraud_reviews")).toMatchObject({ display: "0", tone: "normal" })
    expect(tile("pending_payout_paise")?.display).toBe("₹12,500.00")
    expect(tile("current_period")?.display).toBe("2026-09: ₹500.00 of ₹1,000.00")
    expect(tile("last_settlement_run")?.tone).toBe("bad")
  })
})

describe("two-person and step-up per route", () => {
  const always: MonetizationWrite[] = ["fund.rates", "fund.quality_bands", "fund.budget", "fund.settle_day", "fund.settle_period", "fund.settle_creator_period", "fund.reverse", "refund.issue"]
  const never: MonetizationWrite[] = ["fraud.decide", "wallet.freeze", "wallet.unfreeze", "wallet.rebuild", "creator.suspend", "creator.unsuspend", "dispute.act"]

  it("rates, bands, budgets, settle, settle-period, reversal and refunds are always two-person", () => {
    expect([...MONETIZATION_ALWAYS_TWO_PERSON].sort()).toEqual([...always].sort())
    for (const w of always) expect(monetizationTwoPerson(w)).toBe(true)
  })

  it("fraud, wallet, creator and dispute actions are step-up only", () => {
    for (const w of never) {
      expect(monetizationTwoPerson(w)).toBe(false)
      expect(monetizationStepUp(w)).toBe(true)
    }
  })

  it("a monetization refund is two-person at any amount, with no ₹5,000 threshold", () => {
    expect(monetizationTwoPerson("refund.issue")).toBe(true)
    for (const paise of [1, 499_999, 500_000, 500_001]) {
      expect(monetizationRefundHint(paise)).toContain("Refunds are sent to a second approver.")
      expect(monetizationRefundHint(paise)).not.toMatch(/or more|below|threshold/i)
    }
    expect(monetizationRefundHint(1)).toBe("₹0.01. Refunds are sent to a second approver.")
    expect(monetizationRefundHint(null)).toBe("Enter the amount. Refunds are sent to a second approver.")
  })

  it("a payments resolve is two-person at any amount for refunded_manually and written_off, never for test_data", () => {
    for (const r of ["refunded_manually", "written_off"] as const) {
      expect(resolveNeedsSecondApprover(r)).toBe(true)
      for (const paise of [1, 499_999, 500_000, null]) {
        expect(resolveHint(r, paise)).toContain("Refunds are sent to a second approver.")
        expect(resolveHint(r, paise)).not.toMatch(/or more|below|threshold/i)
      }
      expect(resolveHint(r, 12_000)).toBe("₹120.00. Refunds are sent to a second approver.")
      expect(resolveHint(r)).toBe("Refunds are sent to a second approver.")
    }
    expect(resolveNeedsSecondApprover("test_data")).toBe(false)
    expect(resolveHint("test_data", 10_000_000)).not.toContain("second approver")
  })

  it("accepts period keys of either cadence", () => {
    expect(isPeriodKey("2026-09")).toBe(true)
    expect(isPeriodKey("2026-09-H2")).toBe(true)
    expect(isPeriodKey("2026-13")).toBe(false)
    expect(isPeriodKey("2026-09-H3")).toBe(false)
  })
})

describe("payments confinement", () => {
  const feast = me({ food: ["food:payments_refunds.read", "food:payments_refund.issue", "food:payments_stats.read"] })

  it("a Feast-confined admin sees only Feast, with no picker", () => {
    const scope = paymentsScope(feast)
    expect(scope).toEqual({ kind: "confined", applications: ["feast"] })
    expect(applicationChoices(scope)).toBeNull()
    expect(initialApplication(scope)).toBe("feast")
    expect(hasAppAccess(feast, "payments")).toBe(true)
    expect(buildAdminNav(feast).apps.map((a) => a.app)).toContain("payments")
  })

  it("a confined admin cannot pick another application or all of them", () => {
    const scope = paymentsScope(feast)
    expect(acceptApplication(scope, "mstore")).toBeNull()
    expect(acceptApplication(scope, "")).toBeNull()
    expect(acceptApplication(scope, "feast")).toBe("feast")
    expect(paymentsCan(feast, scope, "mstore", "refunds.read")).toBe(false)
    expect(paymentsCan(feast, scope, "feast", "refunds.read")).toBe(true)
    expect(paymentsCan(feast, scope, "feast", "intents.read")).toBe(false)
  })

  it("a confined admin with several applications must choose one before anything loads", () => {
    const both = me({ food: ["food:payments_refunds.read"], commerce: ["commerce:payments_refunds.read"] })
    const scope = paymentsScope(both)
    expect(scope).toEqual({ kind: "confined", applications: ["mstore", "feast"] })
    expect(initialApplication(scope)).toBeNull()
    expect(applicationChoices(scope)?.map((c) => c.value)).toEqual(["mstore", "feast"])
    expect(visiblePaymentsSections(both, scope, null, PAYMENTS_SECTIONS)).toEqual([])
    expect(ids(visiblePaymentsSections(both, scope, "feast", PAYMENTS_SECTIONS))).toEqual(["refunds"])
    expect(acceptApplication(scope, "dating")).toBeNull()
  })

  it("never widens past the applications /me lists", () => {
    const both = me({ food: ["food:payments_refunds.read"], commerce: ["commerce:payments_refunds.read"] })
    expect(paymentsScope(both, ["feast"])).toEqual({ kind: "confined", applications: ["feast"] })
  })

  it("parses applications from the Payments navigation entry", () => {
    const m = me({ food: ["food:payments_refunds.read"] }, [], [{ app: "payments", label: "Payments", applications: ["feast"] }])
    expect(m.navigation[0].applications).toEqual(["feast"])
  })

  it("a platform payments admin gets All plus each application", () => {
    const admin = me({ payments: ["payments:refunds.read", "payments:intents.read"] })
    const scope = paymentsScope(admin)
    expect(scope).toEqual({ kind: "all" })
    expect(initialApplication(scope)).toBe("")
    expect(applicationChoices(scope)?.map((c) => c.value)).toEqual(["", "mstore", "feast", "dating"])
    expect(acceptApplication(scope, "mstore")).toBe("mstore")
  })

  it("sends application_id only when one is chosen", () => {
    expect(paymentsQuery("", { limit: 50, cursor: null })).toBe("?limit=50")
    expect(paymentsQuery("feast", { status: "" })).toBe("?application_id=feast")
  })

  it("payments stats: a confined application's own counts; a missing application is unavailable", () => {
    const raw = { data: { applications: { feast: { refunds_needing_attention: 2, stuck_intents: 0, refund_failed_alerts_open: 0, failed_payments_24h: 1, captured_today_minor: 120000 } }, total: { refunds_needing_attention: 2 } } }
    const feastView = paymentsStatsView({ status: "ok", raw }, "feast")
    expect(feastView.tiles[0]).toMatchObject({ key: "refunds_needing_attention", display: "2", tone: "bad" })
    expect(feastView.applications).toEqual([])
    expect(paymentsStatsView({ status: "ok", raw }, "mstore").tiles[0].display).toBe("unavailable")
    const all = paymentsStatsView({ status: "ok", raw }, "")
    expect(all.tiles.find((t) => t.key === "stuck_intents")?.display).toBe("unavailable")
    expect(all.applications.map((a) => a.key)).toEqual(["feast"])
  })
})

describe("Money sections per permission set", () => {
  it("a fraud reviewer sees only fraud reviews", () => {
    expect(ids(visibleSections(me({ monetization: ["monetization:fraud.review"] }), "monetization", MONETIZATION_SECTIONS))).toEqual(["fraud"])
  })

  it("a finance admin sees the fund, refunds, payouts and audit", () => {
    const m = me({
      monetization: ["monetization:fund.read", "monetization:fund.settle", "monetization:refund.issue", "monetization:payouts.read", "monetization:audit.read"],
    })
    expect(ids(visibleSections(m, "monetization", MONETIZATION_SECTIONS))).toEqual(["fund", "refunds", "payouts", "audit"])
  })

  it("a platform super-admin sees every section of both", () => {
    const m = me({}, ["*"])
    expect(ids(visibleSections(m, "monetization", MONETIZATION_SECTIONS))).toEqual(MONETIZATION_SECTIONS.map((s) => s.id))
    expect(ids(visiblePaymentsSections(m, paymentsScope(m), "", PAYMENTS_SECTIONS))).toEqual(PAYMENTS_SECTIONS.map((s) => s.id))
  })

  it("a payments reader without manage sees applications but no Money tabs elsewhere", () => {
    const m = me({ payments: ["payments:applications.read", "payments:audit.read"] })
    expect(ids(visiblePaymentsSections(m, paymentsScope(m), "", PAYMENTS_SECTIONS))).toEqual(["applications", "audit"])
    expect(visibleSections(m, "monetization", MONETIZATION_SECTIONS)).toEqual([])
    expect(paymentsCan(m, paymentsScope(m), "", "applications.manage")).toBe(false)
  })

  it("an admin with no payments permission has no payments scope", () => {
    expect(paymentsScope(me({ food: ["food:orders.read"] }))).toEqual({ kind: "none" })
  })
})

describe("what an approver sees for a Money request", () => {
  it("shows a rate before and after, and a settle period", () => {
    const rows = Object.fromEntries(
      moneyPayloadRows({ path: "/creator-fund/rates", body: { content_type: "reel", region_code: "IN", rpm_paise: 1500, previous_rpm_paise: 1200, notes: "x" } }),
    )
    expect(rows["Rate per 1,000 views"]).toContain("₹12.00 → ₹15.00")
    expect(rows["Content type"]).toBe("reel")
    expect(Object.fromEntries(moneyPayloadRows({ path: "/creator-fund/settle-period", query: "period=2026-08" }))["Period"]).toBe("2026-08")
  })

  it("shows a payments resolve's resolution and application", () => {
    const rows = Object.fromEntries(moneyPayloadRows({ command_id: "c-1", resolution: "refunded_manually", application_id: "feast", amount_paise: 500000 }))
    expect(rows).toMatchObject({ Resolution: "Refunded manually", "Payments application": "feast", "Refund command": "c-1" })
  })
})
