/**
 * What the chip rail selects, and what that means on the wire.
 *
 * Pure — no React, no network — for the same reason ../tube/video.ts is: the
 * translation from "which chip is pressed" to "which parameters go on the
 * request" is the part that fails SILENTLY. An ignored parameter is a filter
 * that did nothing; `subscribed_only` sent by accident is an empty page with
 * no explanation; a category slug the taxonomy does not carry is a
 * `400 INVALID_CATEGORY`. None of those throw, and all of them are arithmetic
 * that can be asserted without a browser. ./chips.test.ts.
 *
 * It is also split from ./TubeCategories.tsx because that file is
 * `"use client"`, and this way the rules can be imported anywhere — including
 * by a server component — without dragging a client boundary along.
 *
 * ── The second chip is Subscriptions, and it was Following ────────────────
 * Until 2026-09-12 the chip read "Following" and sent `following_only=true`:
 * authors the viewer FOLLOWS, which on this platform is a wider edge than the
 * channels they SUBSCRIBE to (subscribing creates the follow; following does
 * not subscribe, and many followed accounts have no channel at all). On a
 * page whose left rail already says "Subscriptions", a home chip that
 * narrowed by a different edge under a different word was two vocabularies
 * for what a viewer thinks of as one list. The chip now says Subscriptions
 * and sends `subscribed_only=true`, the same query the Subscriptions page
 * makes (../subscriptions/TubeSubscriptions.tsx), so the two agree to the
 * video. `followingOnly` stays on `TubeFeedQuery` for anything that means
 * the follow graph; nothing on this rail does.
 */

import type { TubeCategory } from "@/tube/channelApi"

/** What the grid is currently asking for. */
export type TubeChip =
  | { kind: "all" }
  | { kind: "subscriptions" }
  | { kind: "category"; id: string }

export const ALL_CHIP: TubeChip = { kind: "all" }

/**
 * Only offered to a signed-in viewer. An anonymous browser is reading the
 * public shelf, which has no subscription graph to narrow by, so for them the
 * chip would be a control that could not work. ./TubeCategories.tsx applies
 * the rule; this is the chip it applies it to.
 */
export const SUBSCRIPTIONS_CHIP: TubeChip = { kind: "subscriptions" }

/** The chip's stable key, for React and for the current-mark. */
export function chipKey(chip: TubeChip): string {
  return chip.kind === "category" ? `category:${chip.id}` : chip.kind
}

/**
 * The chip as feed arguments.
 *
 * Exactly one narrowing at a time, and never both: the endpoint accepts
 * `category` and `subscribed_only` together, but the rail is a single-select
 * and offering a state the rail cannot express would be a filter nobody could
 * turn off from the page they are on.
 *
 * The Subscriptions chip is `subscribedOnly` and NOT `followingOnly` — see
 * the header. The two are different parameters on the wire and different
 * edges in the database, and the one sent by accident is an empty page with
 * no explanation.
 */
export function chipQuery(chip: TubeChip): { category?: string; subscribedOnly?: boolean } {
  if (chip.kind === "subscriptions") return { subscribedOnly: true }
  if (chip.kind === "category") return { category: chip.id }
  return {}
}

/**
 * The word on the chip — and the word the empty state uses.
 *
 * A category whose slug is not in the taxonomy falls back to the slug itself
 * rather than to "Unknown". That case arrives when the server's taxonomy call
 * failed but a chip was somehow already selected, and a raw slug is a worse
 * label and a better clue.
 */
export function chipLabel(chip: TubeChip, categories: readonly TubeCategory[]): string {
  if (chip.kind === "all") return "All"
  if (chip.kind === "subscriptions") return "Subscriptions"
  return categories.find((category) => category.id === chip.id)?.label ?? chip.id
}
