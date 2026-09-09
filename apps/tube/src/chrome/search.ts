/**
 * Where Tube's search goes, and what a query looks like on the wire.
 *
 * ── Why this is not in ./TubeSearch.tsx ───────────────────────────────────
 * Not tidiness — a correctness rule of the App Router. That file is
 * `"use client"`, and a plain function exported from a client module and
 * imported by a SERVER component does not arrive as a function: it arrives as
 * a client reference, and calling it on the server throws. The results page
 * (`app/search/page.tsx`) is a server component and normalises the query
 * before it renders, so the normaliser has to live in a module with no
 * directive on it. Both the box and the page import it from here.
 *
 * Pure, therefore, and testable without a DOM.
 */

import { ZONE } from "@/zone"

/** The results page, zone-relative — what `router.push` inside Tube takes. */
export const TUBE_SEARCH_PATH = "/search"

/**
 * The same page, absolutely — what a `<form action>` needs.
 *
 * A browser submitting a form has never heard of `next/link` and will not add
 * "/tube" for us. This is the same class of mistake as `videoHref` returning
 * "/{id}", in the opposite direction: there, Next adds the prefix and the
 * value must not have it; here, nothing adds it and the value must.
 */
export const TUBE_SEARCH_ACTION = `${ZONE}${TUBE_SEARCH_PATH}`

/**
 * The query as it goes on the wire.
 *
 * Trimming is the only rule the box needs, and it needs it for a reason of
 * its own: search-service trims before deciding a query is empty, so a page
 * rendering results for "   " would be rendering results for a string the
 * service never saw. Deliberately the same rule @momentum/chrome's
 * `normalizeQuery` applies — this is not a second opinion, it is the same one
 * restated locally so this zone owns no import from the chrome it is leaving.
 */
export function normalizeTubeQuery(raw: string | null | undefined): string {
  return (raw ?? "").trim()
}

/** The results URL for a query, zone-relative. */
export function tubeSearchHref(query: string): string {
  return `${TUBE_SEARCH_PATH}?q=${encodeURIComponent(query)}`
}
