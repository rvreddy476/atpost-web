import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { APP_PAGES } from "./apps"
import {
  DISCOUNT_TYPES,
  EMPTY_OFFER,
  OFFERS_PERMISSION,
  OFFER_FUNDERS,
  OFFER_PAYMENT_METHODS,
  canManageOffers,
  checkOffer,
  deactivateOfferBody,
  offerInput,
  offerRequest,
  offerValue,
  sortOffers,
  type OfferInput,
} from "./bankOffers"
import { bpsToPercent, checkWindow, istDay, percentToBps, readCount, readRupees } from "./discounts"
import { buildAdminNav, findNavGroup, parseAdminMe, type AdminMe } from "./me"
import { runSteppedAdminMutation, type SentResponse } from "./mutation"
import {
  COUPONS_PERMISSION,
  COUPON_DISCOUNT_TYPES,
  COUPON_SCOPES,
  EMPTY_STORE_COUPON,
  PLATFORM_COUPONS_OFF_BANNER,
  canManageCoupons,
  checkStoreCoupon,
  couponRequest,
  deactivateCouponBody,
  isPlatformCoupon,
  platformCouponsBanner,
  platformCouponsEnabled,
  sortCoupons,
  storeCouponInput,
  storeCouponValue,
  type StoreCouponInput,
} from "./storeCoupons"

const TODAY = "2026-10-01"

const offer = (over: Partial<OfferInput> = {}): OfferInput => ({
  ...EMPTY_OFFER,
  provider_offer_id: "offer_JTUADI4ZWBGWur",
  title: "10% off with HDFC credit cards",
  discount_value: "10",
  ...over,
})

const coupon = (over: Partial<StoreCouponInput> = {}): StoreCouponInput => ({
  ...EMPTY_STORE_COUPON,
  code: "DIWALI10",
  discount_value: "10",
  ...over,
})

const problemsOf = (r: { ok: boolean; problems?: string[] }) => (r.ok ? [] : (r as { problems: string[] }).problems)
const bodyOf = (r: { ok: boolean; body?: Record<string, unknown> }) => {
  if (!r.ok) throw new Error(`expected ok, got ${JSON.stringify(r)}`)
  return (r as { body: Record<string, unknown> }).body
}

// ---------------------------------------------------------------------------
// Percent → basis points, rupees → paise: exact, never a float multiply
// ---------------------------------------------------------------------------

describe("percent → basis points", () => {
  it("is exact for whole, one- and two-decimal percentages", () => {
    expect(percentToBps("10")).toBe(1000)
    expect(percentToBps("12.5")).toBe(1250)
    expect(percentToBps("0.01")).toBe(1)
    expect(percentToBps("100")).toBe(10_000)
    expect(percentToBps(" 7.5 % ")).toBe(750)
    // 12.35 * 100 and 4.35 * 100 are not integers in floating point; these are.
    expect(percentToBps("12.35")).toBe(1235)
    expect(percentToBps("4.35")).toBe(435)
    expect(percentToBps("0.29")).toBe(29)
  })

  it("refuses 0, above 100, more than two decimals, signs and noise rather than rounding", () => {
    for (const bad of ["0", "0.00", "100.01", "101", "12.345", "-5", "+5", "1e1", "abc", "", ".", "10..5", "5,5"]) {
      expect([bad, percentToBps(bad)]).toEqual([bad, null])
    }
  })

  it("round-trips every basis point from 1 to 10000", () => {
    for (let bps = 1; bps <= 10_000; bps++) expect(percentToBps(bpsToPercent(bps))).toBe(bps)
    expect(bpsToPercent(1250)).toBe("12.5")
    expect(bpsToPercent(1000)).toBe("10")
    expect(bpsToPercent(5)).toBe("0.05")
  })
})

describe("rupees → paise through @atpost/form parseMinor", () => {
  it("is exact where a float multiply drifts", () => {
    expect(readRupees("0.29")).toBe(29)
    expect(readRupees("4.35")).toBe(435)
    expect(readRupees("1,234.56")).toBe(123_456)
    expect(readRupees("₹ 1,00,000")).toBe(10_000_000)
    expect(readRupees("0")).toBe(0)
  })

  it("blank is null; negative, three decimals and junk are undefined", () => {
    expect(readRupees("")).toBeNull()
    expect(readRupees("  ")).toBeNull()
    for (const bad of ["-5", "12.345", "abc", "1e3", "1,,000"]) expect([bad, readRupees(bad)]).toEqual([bad, undefined])
  })

  it("counts are positive whole numbers", () => {
    expect(readCount("")).toBeNull()
    expect(readCount("1")).toBe(1)
    expect(readCount("0")).toBeUndefined()
    expect(readCount("1.5")).toBeUndefined()
    expect(readCount("-1")).toBeUndefined()
  })
})

describe("validity window", () => {
  const labels = { starts: "Starts", ends: "Ends" }
  it("sends Indian day boundaries and refuses an end before the start", () => {
    expect(checkWindow("2026-10-05", "2026-10-31", { labels })).toEqual({ problems: [], starts_at: "2026-10-05T00:00:00+05:30", ends_at: "2026-10-31T23:59:59+05:30" })
    expect(checkWindow("2026-10-05", "2026-10-05", { labels }).problems).toEqual([])
    expect(checkWindow("2026-10-05", "2026-10-04", { labels }).problems).toEqual(["Ends cannot be before starts."])
  })

  it("refuses an end already past only when told today (a create)", () => {
    expect(checkWindow("", "2026-09-30", { labels, today: TODAY }).problems).toEqual(["Ends is already in the past."])
    expect(checkWindow("", "2026-10-01", { labels, today: TODAY }).problems).toEqual([])
    expect(checkWindow("", "2026-09-30", { labels }).problems).toEqual([])
  })

  it("reads a stored instant as its Indian calendar day", () => {
    expect(istDay("2026-10-01T18:30:00Z")).toBe("2026-10-02")
    expect(istDay("2026-10-01T18:29:59Z")).toBe("2026-10-01")
    expect(istDay(null)).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Bank offers
// ---------------------------------------------------------------------------

describe("checkOffer (create)", () => {
  it("builds the registry body: bps, paise, mstore, razorpay", () => {
    const body = bodyOf(checkOffer(offer({ discount_value: "12.5", max_discount: "1,500", min_amount: "4999.99", starts_at: "2026-10-02", ends_at: "2026-10-31" }), { today: TODAY }))
    expect(body).toEqual({
      provider_offer_id: "offer_JTUADI4ZWBGWur",
      application: "mstore",
      provider: "razorpay",
      title: "10% off with HDFC credit cards",
      payment_method: "card",
      discount_type: "percentage",
      funded_by: "bank",
      discount_value: 1250,
      max_discount_minor: 150_000,
      min_amount_minor: 499_999,
      starts_at: "2026-10-02T00:00:00+05:30",
      ends_at: "2026-10-31T23:59:59+05:30",
      active: true,
    })
  })

  it("a flat offer is paise, carries no cap, and a blank minimum is 0", () => {
    const body = bodyOf(checkOffer(offer({ discount_type: "flat", discount_value: "100.50", max_discount: "garbage" }), { today: TODAY }))
    expect(body.discount_value).toBe(10_050)
    expect(body).not.toHaveProperty("max_discount_minor")
    expect(body.min_amount_minor).toBe(0)
    // A cap typed before switching to flat stays in the hidden field; it is never sent.
    expect(bodyOf(checkOffer(offer({ discount_type: "flat", discount_value: "100", max_discount: "500" }), { today: TODAY }))).not.toHaveProperty("max_discount_minor")
  })

  it("requires a Razorpay offer id", () => {
    for (const id of ["", "JTUADI4ZWBGWur", "offer_", "offer_abc", "offer_JTUADI4Z-WBG", "pay_JTUADI4ZWBGWur", "OFFER_JTUADI4ZWBGWur"]) {
      expect(problemsOf(checkOffer(offer({ provider_offer_id: id }), { today: TODAY }))[0]).toMatch(/Razorpay offer id/)
    }
    // A pasted id with stray spaces is trimmed, not refused.
    expect(bodyOf(checkOffer(offer({ provider_offer_id: " offer_JTUADI4ZWBGWur " }), { today: TODAY })).provider_offer_id).toBe("offer_JTUADI4ZWBGWur")
  })

  it("percentage must be above 0 and at most 100", () => {
    for (const v of ["0", "100.5", "12.345", ""]) expect(problemsOf(checkOffer(offer({ discount_value: v }), { today: TODAY }))).toEqual([expect.stringMatching(/percentage above 0 and at most 100/)])
    expect(problemsOf(checkOffer(offer({ discount_value: "100" }), { today: TODAY }))).toEqual([])
  })

  it("flat must be above zero", () => {
    for (const v of ["0", "", "-10", "1.234"]) expect(problemsOf(checkOffer(offer({ discount_type: "flat", discount_value: v }), { today: TODAY }))).toEqual(["A flat offer needs a rupee amount above zero."])
  })

  it("maximum discount is above zero or blank; minimum payment zero or more", () => {
    expect(problemsOf(checkOffer(offer({ max_discount: "0" }), { today: TODAY }))).toEqual([expect.stringMatching(/Maximum discount/)])
    expect(problemsOf(checkOffer(offer({ max_discount: "-1" }), { today: TODAY }))).toEqual([expect.stringMatching(/Maximum discount/)])
    expect(problemsOf(checkOffer(offer({ min_amount: "-1" }), { today: TODAY }))).toEqual([expect.stringMatching(/Minimum payment/)])
    expect(bodyOf(checkOffer(offer({ min_amount: "0" }), { today: TODAY })).min_amount_minor).toBe(0)
  })

  it("title length and date order", () => {
    expect(problemsOf(checkOffer(offer({ title: "ab" }), { today: TODAY }))).toEqual([expect.stringMatching(/Title/)])
    expect(problemsOf(checkOffer(offer({ starts_at: "2026-10-10", ends_at: "2026-10-09" }), { today: TODAY }))).toEqual(["Ends cannot be before starts."])
    expect(problemsOf(checkOffer(offer({ ends_at: "2026-09-01" }), { today: TODAY }))).toEqual(["Ends is already in the past."])
  })
})

describe("checkOffer (edit)", () => {
  const stored = {
    id: "o-1",
    provider_offer_id: "offer_JTUADI4ZWBGWur",
    application: "mstore",
    provider: "razorpay",
    title: "10% off with HDFC credit cards",
    description: null,
    payment_method: "card",
    discount_type: "percentage",
    discount_value: 1000,
    max_discount_minor: 150_000,
    min_amount_minor: 0,
    funded_by: "bank",
    starts_at: "2026-10-01T18:30:00Z",
    ends_at: null,
    active: true,
  }

  it("the form starts from the stored offer, and an untouched form sends nothing", () => {
    const input = offerInput(stored)
    expect(input).toMatchObject({ discount_value: "10", max_discount: "1500.00", min_amount: "", starts_at: "2026-10-02", ends_at: "" })
    expect(problemsOf(checkOffer(input, { stored }))).toEqual(["Nothing has changed."])
  })

  it("sends only what changed, never the Razorpay id", () => {
    const body = bodyOf(checkOffer({ ...offerInput(stored), discount_value: "12.5", ends_at: "2026-12-31", provider_offer_id: "offer_SomethingElse1" }, { stored }))
    expect(body).toEqual({ discount_value: 1250, ends_at: "2026-12-31T23:59:59+05:30" })
  })

  it("clearing the cap sends null", () => {
    expect(bodyOf(checkOffer({ ...offerInput(stored), max_discount: "" }, { stored }))).toEqual({ max_discount_minor: null })
  })

  it("deactivate is PATCH active=false, create is POST, nothing is DELETE", () => {
    expect(deactivateOfferBody()).toEqual({ active: false })
    expect(offerRequest({ kind: "deactivate", id: "o/1", body: deactivateOfferBody() })).toEqual({ method: "patch", url: "/v1/admin/payments/offers/o%2F1", body: { active: false } })
    expect(offerRequest({ kind: "create", body: { a: 1 } })).toEqual({ method: "post", url: "/v1/admin/payments/offers", body: { a: 1 } })
    expect(offerRequest({ kind: "edit", id: "o-1", body: {} }).method).toBe("patch")
  })

  it("shows the discount in rupees and per cent", () => {
    expect(offerValue(stored)).toBe("10% off, up to ₹1,500.00")
    expect(offerValue({ discount_type: "flat", discount_value: 10_050 })).toBe("₹100.50 off")
  })
})

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

describe("checkStoreCoupon (create)", () => {
  it("builds commerce's body: upper-cased code, bps, paise, limits", () => {
    const body = bodyOf(
      checkStoreCoupon(coupon({ code: "diwali 10", discount_value: "12.5", max_discount: "200", min_order: "999.99", max_uses: "500", max_uses_per_user: "2", starts_at: "2026-10-05", expires_at: "2026-11-05" }), { today: TODAY }),
    )
    expect(body).toEqual({
      code: "DIWALI10",
      discount_type: "percentage",
      discount_value: 1250,
      applicable_to: "all",
      max_discount_minor: 20_000,
      min_order_minor: 99_999,
      max_uses: 500,
      max_uses_per_user: 2,
      starts_at: "2026-10-05T00:00:00+05:30",
      expires_at: "2026-11-05T23:59:59+05:30",
      is_public: true,
      is_active: true,
    })
  })

  it("code is 4–20 capital letters and digits", () => {
    for (const code of ["ABC", "A".repeat(21), "DIWALI-10", "DIWALI_10", "₹100OFF", ""]) {
      expect([code, problemsOf(checkStoreCoupon(coupon({ code }), { today: TODAY }))]).toEqual([code, ["Code must be 4–20 letters and digits, with no spaces or symbols."]])
    }
    expect(bodyOf(checkStoreCoupon(coupon({ code: "abcd" }), { today: TODAY })).code).toBe("ABCD")
    expect(bodyOf(checkStoreCoupon(coupon({ code: "A".repeat(20) }), { today: TODAY })).code).toBe("A".repeat(20))
  })

  it("percent 0–100, flat above zero", () => {
    expect(problemsOf(checkStoreCoupon(coupon({ discount_value: "0" }), { today: TODAY }))).toEqual([expect.stringMatching(/percentage above 0 and at most 100/)])
    expect(problemsOf(checkStoreCoupon(coupon({ discount_value: "101" }), { today: TODAY }))).toEqual([expect.stringMatching(/percentage above 0 and at most 100/)])
    expect(bodyOf(checkStoreCoupon(coupon({ discount_value: "100" }), { today: TODAY })).discount_value).toBe(10_000)
    expect(problemsOf(checkStoreCoupon(coupon({ discount_type: "flat", discount_value: "0" }), { today: TODAY }))).toEqual(["A flat coupon needs a rupee amount above zero."])
    const flat = bodyOf(checkStoreCoupon(coupon({ discount_type: "flat", discount_value: "4.35", max_discount: "junk" }), { today: TODAY }))
    expect(flat.discount_value).toBe(435)
    expect(flat).not.toHaveProperty("max_discount_minor")
    expect(bodyOf(checkStoreCoupon(coupon({ discount_type: "flat", discount_value: "100", max_discount: "500" }), { today: TODAY }))).not.toHaveProperty("max_discount_minor")
  })

  it("maximum discount above zero or blank; minimum order zero or more", () => {
    expect(problemsOf(checkStoreCoupon(coupon({ max_discount: "0" }), { today: TODAY }))).toEqual([expect.stringMatching(/Maximum discount/)])
    expect(problemsOf(checkStoreCoupon(coupon({ min_order: "-1" }), { today: TODAY }))).toEqual([expect.stringMatching(/Minimum order/)])
    expect(problemsOf(checkStoreCoupon(coupon({ min_order: "1.001" }), { today: TODAY }))).toEqual([expect.stringMatching(/Minimum order/)])
    expect(bodyOf(checkStoreCoupon(coupon({ min_order: "" }), { today: TODAY })).min_order_minor).toBe(0)
  })

  it("uses: whole numbers, per buyer never above the total", () => {
    expect(problemsOf(checkStoreCoupon(coupon({ max_uses: "0" }), { today: TODAY }))).toEqual([expect.stringMatching(/Total uses/)])
    expect(problemsOf(checkStoreCoupon(coupon({ max_uses_per_user: "" }), { today: TODAY }))).toEqual([expect.stringMatching(/Uses per buyer must/)])
    expect(problemsOf(checkStoreCoupon(coupon({ max_uses: "1", max_uses_per_user: "2" }), { today: TODAY }))).toEqual(["Uses per buyer cannot be more than total uses."])
  })

  it("date order", () => {
    expect(problemsOf(checkStoreCoupon(coupon({ starts_at: "2026-10-10", expires_at: "2026-10-09" }), { today: TODAY }))).toEqual(["Expires cannot be before starts."])
  })

  it("a scoped coupon needs full ids", () => {
    expect(problemsOf(checkStoreCoupon(coupon({ applicable_to: "product" }), { today: TODAY }))).toEqual(["List at least one id, or choose All products."])
    expect(problemsOf(checkStoreCoupon(coupon({ applicable_to: "product", applicable_ids: "abc" }), { today: TODAY }))).toEqual(["Each id must be a full id (36 characters)."])
    const id = "11111111-1111-4111-8111-111111111111"
    expect(bodyOf(checkStoreCoupon(coupon({ applicable_to: "category", applicable_ids: `${id.toUpperCase()},\n${id}` }), { today: TODAY })).applicable_ids).toEqual([id])
  })
})

describe("checkStoreCoupon (edit)", () => {
  const stored = {
    id: "c-1",
    code: "DIWALI10",
    seller_id: null,
    funded_by: "platform",
    discount_type: "percentage",
    discount_value: 1000,
    max_discount_minor: 20_000,
    min_order_minor: 0,
    max_uses: null,
    max_uses_per_user: 1,
    applicable_to: "all",
    starts_at: "2026-10-05T00:00:00+05:30",
    expires_at: null,
    is_public: true,
    is_active: true,
  }

  it("an untouched form sends nothing", () => {
    expect(problemsOf(checkStoreCoupon(storeCouponInput(stored), { stored }))).toEqual(["Nothing has changed."])
  })

  it("sends only the editable fields that changed; code, discount and scope are never sent", () => {
    const body = bodyOf(checkStoreCoupon({ ...storeCouponInput(stored), code: "OTHER123", discount_value: "50", applicable_to: "seller", max_uses: "100", is_public: false }, { stored }))
    expect(body).toEqual({ max_uses: 100, is_public: false })
  })

  it("deactivate is PATCH is_active=false", () => {
    expect(deactivateCouponBody()).toEqual({ is_active: false })
    expect(couponRequest({ kind: "deactivate", id: "c-1", body: deactivateCouponBody() })).toEqual({ method: "patch", url: "/v1/admin/commerce/coupons/c-1", body: { is_active: false } })
    expect(couponRequest({ kind: "create", body: {} })).toMatchObject({ method: "post", url: "/v1/admin/commerce/coupons" })
  })

  it("reads commerce's column names as well as the contract's", () => {
    expect(storeCouponValue({ discount_type: "percentage", discount_basis_points: 1250, max_discount_amount_minor: 20_000 })).toBe("12.5% off, up to ₹200.00")
    expect(storeCouponValue({ discount_type: "flat", discount_value_minor: 10_000 })).toBe("₹100.00 off")
    expect(storeCouponValue({ discount_type: "free_shipping" })).toBe("Free shipping")
  })

  it("tells platform from seller coupons", () => {
    expect(isPlatformCoupon({ funded_by: "platform", seller_id: "s" })).toBe(true)
    expect(isPlatformCoupon({ funded_by: "seller" })).toBe(false)
    expect(isPlatformCoupon({ seller_id: null })).toBe(true)
    expect(isPlatformCoupon({ seller_id: "s-1" })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// The platform-coupons switch
// ---------------------------------------------------------------------------

describe("platform coupons banner", () => {
  it("is shown only while the switch is not on", () => {
    expect(platformCouponsBanner({ data: [], meta: { platform_coupons_enabled: false, total: 0 } })).toBe(PLATFORM_COUPONS_OFF_BANNER)
    expect(platformCouponsBanner({ data: [], meta: { platform_coupons_enabled: true } })).toBeNull()
    expect(platformCouponsBanner({ data: { items: [], meta: { platform_coupons_enabled: true } } })).toBeNull()
  })

  it("an answer that leaves the switch out, or says anything but true, reads as off", () => {
    expect(platformCouponsEnabled({ data: [] })).toBe(false)
    expect(platformCouponsEnabled({ data: [], meta: { platform_coupons_enabled: "true" } })).toBe(false)
    expect(platformCouponsEnabled(null)).toBe(false)
  })

  it("says what the founder asked for", () => {
    expect(PLATFORM_COUPONS_OFF_BANNER).toBe(
      "Platform coupons are switched off until the tax adviser confirms the GST treatment. You can prepare them; buyers can't use them yet.",
    )
  })
})

// ---------------------------------------------------------------------------
// Navigation and reading order
// ---------------------------------------------------------------------------

function me(apps: Record<string, string[]>, platform: string[] = []): AdminMe {
  const parsed = parseAdminMe({
    data: {
      user_id: "u-1",
      permissions: { platform, apps },
      mfa: { required: true, verified: true },
      navigation: [
        { app: "commerce", label: "MStore" },
        { app: "payments", label: "Payments" },
      ],
    },
  })
  if (!parsed) throw new Error("fixture did not parse")
  return parsed
}

describe("navigation by permission", () => {
  it("MStore → Coupons only with commerce:coupons.manage", () => {
    const with_ = me({ commerce: ["commerce:coupons.manage"] })
    expect(findNavGroup(buildAdminNav(with_), "commerce")?.links).toEqual([{ id: "coupons", label: "Coupons", href: "/commerce/coupons" }])
    expect(canManageCoupons(with_)).toBe(true)
    const without = me({ commerce: ["commerce:products.moderate"] })
    expect(findNavGroup(buildAdminNav(without), "commerce")?.links.map((l) => l.id)).toEqual(["products"])
    expect(canManageCoupons(without)).toBe(false)
  })

  it("Payments → Bank offers only with payments:offers.manage, never through an MStore confinement", () => {
    const with_ = me({ payments: ["payments:offers.manage"] })
    expect(findNavGroup(buildAdminNav(with_), "payments")?.links).toEqual([{ id: "offers", label: "Bank offers", href: "/payments/offers" }])
    expect(canManageOffers(with_)).toBe(true)
    const reader = me({ payments: ["payments:intents.read"] })
    expect(findNavGroup(buildAdminNav(reader), "payments")?.links).toEqual([])
    expect(canManageOffers(reader)).toBe(false)
    const confined = me({ commerce: ["commerce:payments_offers.manage", "commerce:payments_intents.read"] })
    expect(findNavGroup(buildAdminNav(confined), "payments")?.links ?? []).toEqual([])
    expect(canManageOffers(confined)).toBe(false)
  })

  it("a platform superadmin sees both pages", () => {
    const admin = me({}, ["*"])
    expect(findNavGroup(buildAdminNav(admin), "payments")?.links.map((l) => l.id)).toEqual(["offers"])
    expect(findNavGroup(buildAdminNav(admin), "commerce")?.links.map((l) => l.id)).toContain("coupons")
  })

  it("lists MStore's pages A to Z", () => {
    const all = me({ commerce: ["commerce:catalogue.edit", "commerce:seller.approve", "commerce:products.moderate", "commerce:payouts.read", "commerce:coupons.manage"] })
    expect(findNavGroup(buildAdminNav(all), "commerce")?.links.map((l) => l.label)).toEqual(["Catalogue", "Coupons", "Payouts", "Products", "Sellers"])
  })

  it("the rail and the pages check the same permission", () => {
    expect(APP_PAGES.find((p) => p.id === "coupons")?.permission).toBe(COUPONS_PERMISSION)
    expect(APP_PAGES.find((p) => p.id === "offers")?.permission).toBe(OFFERS_PERMISSION)
  })
})

describe("reading order", () => {
  const sorted = (labels: string[]) => [...labels].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }))
  it("every select lists its options A to Z", () => {
    for (const options of [OFFER_PAYMENT_METHODS, OFFER_FUNDERS, DISCOUNT_TYPES, COUPON_DISCOUNT_TYPES, COUPON_SCOPES]) {
      const labels = options.map((o) => o.label)
      expect(labels).toEqual(sorted(labels))
    }
  })

  it("the lists are by title and by code", () => {
    expect(sortOffers([{ title: "Zeta" }, { title: "axis" }, { title: "HDFC" }]).map((r) => r.title)).toEqual(["axis", "HDFC", "Zeta"])
    expect(sortCoupons([{ code: "SAVE20" }, { code: "DIWALI10" }, { code: "FEST5" }]).map((r) => r.code)).toEqual(["DIWALI10", "FEST5", "SAVE20"])
  })
})

// ---------------------------------------------------------------------------
// Step-up before every write
// ---------------------------------------------------------------------------

describe("runSteppedAdminMutation: the 2FA prompt before the write", () => {
  const ok: SentResponse = { status: 200, data: { data: { id: "x" } } }
  const stepUpNeeded = { response: { status: 403, data: { error: { code: "STEP_UP_REQUIRED" } } } }

  function harness(answers: boolean[], results: (SentResponse | Error | object)[]) {
    const order: string[] = []
    const stepUp = vi.fn(async () => {
      order.push("step-up")
      return answers.shift() ?? false
    })
    const send = vi.fn(async () => {
      order.push("send")
      const next = results.shift() ?? ok
      if ("status" in next && typeof (next as SentResponse).status === "number") return next as SentResponse
      throw next
    })
    return { order, stepUp, send }
  }

  it("asks for the code BEFORE sending when no window is open", async () => {
    const h = harness([true], [ok])
    expect((await runSteppedAdminMutation(h.send, h.stepUp, false)).kind).toBe("done")
    expect(h.order).toEqual(["step-up", "send"])
  })

  it("sends nothing when the prompt is dismissed", async () => {
    const h = harness([false], [ok])
    expect(await runSteppedAdminMutation(h.send, h.stepUp, false)).toEqual({ kind: "cancelled" })
    expect(h.send).not.toHaveBeenCalled()
  })

  it("uses an open window without asking", async () => {
    const h = harness([], [ok])
    await runSteppedAdminMutation(h.send, h.stepUp, true)
    expect(h.order).toEqual(["send"])
  })

  it("a window that lapsed server-side gets one prompt and one retry", async () => {
    const h = harness([true], [stepUpNeeded, ok])
    expect((await runSteppedAdminMutation(h.send, h.stepUp, true)).kind).toBe("done")
    expect(h.order).toEqual(["send", "step-up", "send"])
  })

  it("both pages send every write through the step-up-first mutation", () => {
    for (const file of ["../../components/money/BankOffers.tsx", "../../components/commerce/StoreCoupons.tsx"]) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8")
      const calls = source.split("useAdminMutation<").slice(1)
      expect(calls.length).toBeGreaterThan(0)
      for (const call of calls) expect(call.slice(0, call.indexOf("})"))).toMatch(/stepUpFirst: \(\) => stepUpWindowOpen\(me\.stepUpValidUntil, Date\.now\(\)\)/)
      // No write leaves the page any other way.
      expect(source).not.toMatch(/\bapi\.(post|patch|put|delete)\(/)
    }
    // …and the hook honours it: a stepUpFirst caller goes through the prompt-first runner.
    const hook = readFileSync(fileURLToPath(new URL("../../hooks/useAdminMutation.tsx", import.meta.url)), "utf8")
    expect(hook).toContain("return stepUpFirst ? runSteppedAdminMutation(send, stepUp, stepUpFirst()) : runAdminMutation(send, stepUp)")
  })
})
