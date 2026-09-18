/**
 * Why the ranker put this person in the rail — said in this product's words.
 *
 * ── The rail was printing a dead brand ────────────────────────────────────
 * `/v1/suggestions` sends `explain_text` as a finished sentence and the rail
 * rendered it verbatim. For every row in the only bucket that has candidates
 * in it today — `trending` — that sentence is built server-side as
 * `"Popular on " + brandName` (suggestion-service, internal/service). The
 * deployed copy of that constant says **atPost**: a product that no longer
 * exists, printed in the chrome of a product called Momentum, beside a
 * wordmark that says so.
 *
 * ── Why this does not simply rewrite the string ───────────────────────────
 * Search-and-replacing a server sentence hides the drift and makes it
 * permanent — the note this replaces said exactly that, and was right. What
 * it concluded from it was not: that printing the wrong name and "reporting
 * it" was the honest option. It is not. The reader is shown a lie either way;
 * the only difference is who knows.
 *
 * The real answer is the one suggestion-service's own `brand.go` names as the
 * right long-term shape and says it is waiting for the clients to ship:
 *
 *   "Drop the prose and let the client render from reason_codes … the codes
 *   ("POPULAR", "NEW_CREATOR", …) are already on the wire, so each client
 *   could own, localise and never drift its own copy. It is not done here
 *   because explain_text is rendered verbatim today by the shipped Android
 *   app … and by the web right rail."
 *
 * This is the web half of that. The codes are on the wire; the copy for the
 * two that name the product is ours and comes from @momentum/brand, so the
 * next rename is one constant and not a redeploy of a backend service.
 *
 * ── And it does NOT throw the server's prose away ─────────────────────────
 * A scored candidate's `explain_text` carries facts this client does not have
 * and cannot reconstruct: "Both in Weekend Cyclists", "Studied at …", "Ada
 * and 3 others follow them". Those are worth far more than any sentence a
 * client could compose, and none of them names a product. So the rule is
 * narrow: a server sentence is printed unless it names a product, and only
 * then is it replaced by our own copy for the row's own reason code.
 *
 * ── Numbers the server is not computing ───────────────────────────────────
 * `mutual_friend_count` is real on the scored path and a hardcoded zero on
 * three others (the popular fallback a new account gets, the interstitial,
 * and every `type=follow` row). `score` is zero on the same three and is not
 * drawn anywhere. So the mutuals line is shown only above zero — a "0 mutual
 * friends" would be false for the rows that compute it and meaningless for
 * the rows that do not — and nothing here invents a figure to fill a line.
 *
 * Pure: no React, no network. The whole point is that the rule is a table.
 */

import { BRAND } from "@momentum/brand"

/**
 * Product names this codebase has shipped under, lowercased.
 *
 * The CURRENT name is in the list too, and deliberately. The rule is not
 * "catch the stale one" — that would need updating at every rename, which is
 * the maintenance failure this whole file exists to end. It is "the UI states
 * product names in its own words", so any sentence carrying one is rebuilt
 * from the code beside it. The list only has to be complete enough to catch a
 * server that has not been redeployed.
 */
const PRODUCT_WORDS = ["atpost", "at post", "postbook", "momentum"]

/** Whether a server-written sentence names a product. See PRODUCT_WORDS. */
export function namesAProduct(text: string): boolean {
  const lower = text.toLowerCase()
  return PRODUCT_WORDS.some((word) => lower.includes(word))
}

/**
 * Our copy for a reason code. Only the codes whose meaning is expressible
 * without data we were not sent — a `SAME_SCHOOL` row carries the school name
 * in `explain_text` and nowhere else, so there is nothing to say here that
 * would not be vaguer than the sentence it replaces.
 */
const REASON_COPY: Record<string, string> = {
  POPULAR: `Popular on ${BRAND.name}`,
  NEW_CREATOR: `New to ${BRAND.name}`,
  TRENDING_REGION: "Trending right now",
  MUTUAL_FOLLOW: "You follow each other",
  CONTACT_MATCH: "In your contacts",
  FRIENDS_FOLLOW: "Followed by people you know",
  MUTUAL_FRIENDS: "You have friends in common",
  COMMON_GROUPS: "In groups you are in",
  TRIADIC_CLOSURE: "Connected to people you know",
}

/** The last resort: true, says nothing that was not sent, names no product. */
export const GENERIC_REASON = "Suggested for you"

export interface SuggestionReasonInput {
  explain_text?: string
  reason_codes?: string[]
  mutual_friend_count?: number
}

/**
 * The one line printed under a suggested person's name.
 *
 * Order: a real mutual count first (it is the strongest thing we can say and
 * it is ours, not prose), then the server's sentence when it names no
 * product, then our copy for the first code we have copy for, then the
 * generic line.
 */
export function suggestionReason(row: SuggestionReasonInput): string {
  const mutuals = row.mutual_friend_count ?? 0
  if (mutuals > 0) {
    return `${mutuals} mutual ${mutuals === 1 ? "friend" : "friends"}`
  }

  const explain = (row.explain_text ?? "").trim()
  if (explain && !namesAProduct(explain)) return explain

  for (const code of row.reason_codes ?? []) {
    const copy = REASON_COPY[code]
    if (copy) return copy
  }
  return GENERIC_REASON
}
