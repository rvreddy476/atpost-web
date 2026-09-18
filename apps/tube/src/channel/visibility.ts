/**
 * "Who can see this one" — the badge on a row of your OWN channel.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS IS ONLY EVER DRAWN ON YOUR OWN CHANNEL
 *
 * `/v1/posts/by-author/{id}` filters by the viewer: a stranger's request
 * returns this author's public rows, and the author's own request is the only
 * one that can carry anything narrower. So a badge here is never a leak — it
 * cannot be, because the row it would label is not in the response.
 *
 * What it prevents is the opposite mistake, and it is a real one. A creator
 * looks at their channel page to see what the world sees. If their unlisted
 * cut and their private draft sit in that grid unmarked, the page is telling
 * them something false about their own channel in the most expensive
 * direction: they conclude a video is public when it is not, or that a
 * private one is live. The grid is the same grid either way; the badge is the
 * difference between it being a preview and it being a lie.
 *
 * The rows are NOT filtered out for the owner, which was the alternative.
 * Hiding them would make the owner's own page disagree with their Your Videos
 * page for no reason they could see, and "where did my unlisted video go" is a
 * worse question than a small word on a card.
 *
 * ── The four values are the studio's four ─────────────────────────────────
 * `public` / `unlisted` / `followers` / `private`, from `VISIBILITY_OPTIONS`
 * in ../studio/fields.ts, which is what the upload flow writes and what
 * `POST /v1/videos/{id}/publish` sets to "public". They are restated here
 * rather than imported: that module is another agent's, it opens far more
 * than a string list, and this file's whole point is that it is pure enough
 * to assert without one. The test beside it pins the vocabulary so a drift
 * between the two is a red test rather than a blank badge.
 *
 * Pure: no React, no network. ./visibility.test.ts is the assertion.
 */

/** What to draw on a row, or null for a row that needs no badge. */
export interface VisibilityBadge {
  /** The word on the chip. Short, because it sits over a poster. */
  label: string
  /** The full sentence, for the card's accessible name. */
  description: string
}

/**
 * The badge for one row's `visibility`, or null.
 *
 * Null for `public`, for an absent field and for a value this client does not
 * know — and the last of those is the interesting one. An unrecognised
 * visibility is a server that grew a fifth audience, and inventing a chip
 * that says "restricted" for it would be this page guessing at a rule it has
 * not been told. Saying nothing is the only answer that cannot be wrong; the
 * row is still drawn, still opens, and still behaves however the server says.
 */
export function visibilityBadge(visibility: string | null | undefined): VisibilityBadge | null {
  switch ((visibility ?? "").trim().toLowerCase()) {
    case "unlisted":
      return { label: "Unlisted", description: "Unlisted — only people with the link" }
    case "private":
      return { label: "Private", description: "Private — only you" }
    case "followers":
      return { label: "Followers", description: "Followers only" }
    default:
      return null
  }
}
