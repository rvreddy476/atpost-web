import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { PlatformCouponsBanner } from "./StoreCoupons"
import { BankOffersExplainer } from "@/components/money/BankOffers"

describe("PlatformCouponsBanner", () => {
  it("shows the switched-off sentence while meta.platform_coupons_enabled is false", () => {
    const html = renderToStaticMarkup(<PlatformCouponsBanner raw={{ data: [], meta: { platform_coupons_enabled: false } }} />)
    expect(html).toContain("Platform coupons are switched off until the tax adviser confirms the GST treatment.")
    expect(html).toContain("You can prepare them; buyers can&#x27;t use them yet.")
    expect(html).toContain('role="note"')
  })

  it("shows nothing once the switch is on", () => {
    expect(renderToStaticMarkup(<PlatformCouponsBanner raw={{ data: [], meta: { platform_coupons_enabled: true } }} />)).toBe("")
  })

  it("shows nothing before the list answer is in", () => {
    expect(renderToStaticMarkup(<PlatformCouponsBanner raw={undefined} />)).toBe("")
  })
})

describe("BankOffersExplainer", () => {
  it("says the offer must exist in Razorpay first and is applied in the Razorpay sheet", () => {
    const html = renderToStaticMarkup(<BankOffersExplainer />)
    expect(html).toContain("Create the offer in the Razorpay dashboard first.")
    expect(html).toContain("applies it inside the Razorpay payment sheet")
  })
})
