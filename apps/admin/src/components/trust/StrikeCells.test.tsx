import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { StrikeOriginCell, StrikeSeverityCell, StrikeStateCell } from "./StrikeCells"

/**
 * A strike row must say, without a legend, whether the strike still counts:
 * active (and until when), expired (time passed), or voided (an admin undid
 * it, with the reason kept). The void reason is on the row because a void
 * never deletes.
 */

const NOW = Date.parse("2026-09-29T12:00:00Z")
const DAY = 86_400_000
const at = (days: number) => new Date(NOW + days * DAY).toISOString()

const strike = (over: Record<string, unknown> = {}) => ({
  id: "11111111-1111-4111-8111-111111111111",
  severity: "strike",
  reason: "repeat spam",
  policy_version: "strike-v1",
  created_at: at(-10),
  expires_at: at(80),
  ...over,
})

describe("StrikeStateCell", () => {
  it("says an active strike is active and when it expires", () => {
    const html = renderToStaticMarkup(<StrikeStateCell strike={strike()} now={NOW} />)
    expect(html).toContain('data-strike-state="active"')
    expect(html).toContain("Active")
    expect(html).toContain("Expires ")
    expect(html).not.toContain("Expired")
  })

  it("says an expired strike expired", () => {
    const html = renderToStaticMarkup(<StrikeStateCell strike={strike({ expires_at: at(-1) })} now={NOW} />)
    expect(html).toContain('data-strike-state="expired"')
    expect(html).toContain("Expired ")
  })

  it("shows a voided strike as voided, with who and why, even when it has also expired", () => {
    const html = renderToStaticMarkup(
      <StrikeStateCell
        strike={strike({ expires_at: at(-1), voided_at: at(-2), voided_by: "22222222-2222-4222-8222-222222222222", void_reason: "issued against the wrong account" })}
        now={NOW}
      />,
    )
    expect(html).toContain('data-strike-state="voided"')
    expect(html).toContain("Voided ")
    expect(html).toContain("22222222…")
    expect(html).toContain("issued against the wrong account")
    expect(html).not.toContain("Expired")
  })
})

describe("StrikeSeverityCell", () => {
  it("colours a severe strike red, a strike amber, a warning plain", () => {
    expect(renderToStaticMarkup(<StrikeSeverityCell severity="severe_strike" />)).toContain("text-mo-bad")
    expect(renderToStaticMarkup(<StrikeSeverityCell severity="strike" />)).toContain("text-mo-warn")
    const warning = renderToStaticMarkup(<StrikeSeverityCell severity="warning" />)
    expect(warning).toContain("Warning")
    expect(warning).not.toContain("text-mo-warn")
    expect(warning).not.toContain("text-mo-bad")
  })
})

describe("StrikeOriginCell", () => {
  it("names the case and the policy version, or says the strike was issued by hand", () => {
    const fromCase = renderToStaticMarkup(<StrikeOriginCell strike={strike({ case_id: "33333333-3333-4333-8333-333333333333" })} />)
    expect(fromCase).toContain("33333333…")
    expect(fromCase).toContain("Policy strike-v1")
    expect(renderToStaticMarkup(<StrikeOriginCell strike={strike()} />)).toContain("Issued by hand")
  })
})
