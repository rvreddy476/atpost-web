"use client"

import { useEffect, useState } from "react"

/**
 * Affiliate-attribution session glue.
 *
 * When a viewer lands on a product page from an in-video tag, the
 * commerce-service redirect sets `?via=<affiliate_code>`. The buyer
 * may then:
 *   - browse other products before deciding
 *   - put the item in their cart
 *   - check out
 *
 * The affiliate code has to survive every one of those hops so the
 * eventual order carries the right via= for monetization-service to
 * attribute commission. sessionStorage is the right tier — wider
 * than the URL hop, narrower than localStorage (we don't want a
 * cookie from last week's reel to credit an unrelated order today).
 *
 * Convention
 *   key: "atpost.affiliate_via"
 *   value: bare code string (e.g. "abc123")
 *   reset: cleared on checkout success (callers responsibility).
 *
 * Last-touch wins
 *   If the viewer arrives via affiliate A, then taps a different
 *   product via affiliate B before buying, B's code is what
 *   commission attribution should use. The last-touch rule matches
 *   how every other affiliate network in the industry behaves and
 *   avoids the "who gets credit when two creators tag the same
 *   product" problem.
 */
const SESSION_KEY = "atpost.affiliate_via"

/**
 * Capture-side hook. Reads ?via= from the URL on mount; if present,
 * persists it. Returns the current attribution, regardless of source.
 *
 * Idempotent — calling on every page mount is fine.
 */
export function useAffiliateAttribution(): string | null {
    const [via, setVia] = useState<string | null>(null)

    useEffect(() => {
        if (typeof window === "undefined") return
        const url = new URL(window.location.href)
        const fromURL = url.searchParams.get("via")
        if (fromURL) {
            try {
                sessionStorage.setItem(SESSION_KEY, fromURL)
            } catch {
                // Quota-exceeded or privacy mode — fall through.
            }
            setVia(fromURL)
            return
        }
        try {
            const persisted = sessionStorage.getItem(SESSION_KEY)
            if (persisted) setVia(persisted)
        } catch {
            // sessionStorage unavailable; nothing to do.
        }
    }, [])

    return via
}

/**
 * Read-only accessor for non-React surfaces (e.g. axios interceptor
 * that needs to add via= to checkout payload).
 */
export function readAffiliateAttribution(): string | null {
    if (typeof window === "undefined") return null
    try {
        return sessionStorage.getItem(SESSION_KEY)
    } catch {
        return null
    }
}

/**
 * Clear attribution. Caller-responsibility — invoke on successful
 * checkout so a follow-up purchase isn't credited to the same
 * affiliate.
 */
export function clearAffiliateAttribution(): void {
    if (typeof window === "undefined") return
    try {
        sessionStorage.removeItem(SESSION_KEY)
    } catch {
        // ignore
    }
}
