/**
 * The rail's controls, in order, each with the label under its glyph.
 *
 * A transcription of `ReelRail.kt`'s `railControls` from the Android client
 * (feature/feed/.../ui/reels/ReelRail.kt), so the two clients cannot drift
 * about which controls a reel offers or what they say. The reasoning there is
 * the founder's, 2026-09-04, from YouTube Shorts: every control names itself.
 *
 * Like and Comment carry their COUNT as the label — "8.8K" — and fall back to
 * the noun when there is nothing to count, because "0" under a heart reads as
 * a score and "Like" reads as an invitation. Save says whether it is done.
 * Share follows the author's `hide_share` switch, and Comment the author's
 * `no_comments` switch — both are permissions the SERVER enforces (posting to
 * a `no_comments` post is a 403 COMMENTS_DISABLED), so rendering the control
 * anyway would be promising something the client cannot deliver.
 *
 * ── Two deliberate differences from the Android list ──────────────────────
 * Mute is not here on either client, but for different reasons. On Android it
 * sits under the rail, unlabelled, as the session's one mute. On the web the
 * player owns sound — see the note in ReelsViewer.tsx — so there is no mute
 * control in this zone at all.
 *
 * There is no More. It left the Android rail for the header's hamburger
 * (founder, 2026-09-05) and there is nothing for it to open here yet; an
 * entry that opened nothing would be the "header glyph that does nothing"
 * ReelsScreen.kt's own signature warns about.
 *
 * No JSX and no React in this file, so the rule can be asserted without a
 * browser — which is the assertion that actually matters.
 */

export type RailKind = "like" | "comment" | "share" | "save"

export interface RailControl {
  kind: RailKind
  /** What the control says about itself: the count, or its own name. */
  label: string
}

export interface RailInput {
  likes: number
  comments: number
  liked: boolean
  saved: boolean
  /** The author's switches, straight off the post. */
  noComments?: boolean
  hideShare?: boolean
}

/**
 * The compact count when there is one, the control's own name when there is
 * not. `formatCount`'s rule from the Android design system: thousands to one
 * decimal, and no trailing ".0".
 */
export function railCountLabel(count: number, noun: string): string {
  return count > 0 ? formatCount(count) : noun
}

/** "999", "1.2K", "12K", "1.4M". Never "1.0K". */
export function formatCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0"
  const n = Math.floor(count)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${trim(n / 1_000)}K`
  return `${trim(n / 1_000_000)}M`
}

function trim(value: number): string {
  // One decimal, but only when it says something: 1.2K is informative and
  // 1.0K is just a longer 1K.
  const one = Math.floor(value * 10) / 10
  return Number.isInteger(one) ? String(one) : one.toFixed(1)
}

export function railControls(input: RailInput): RailControl[] {
  const out: RailControl[] = [
    { kind: "like", label: railCountLabel(input.likes, "Like") },
  ]
  if (!input.noComments) {
    out.push({ kind: "comment", label: railCountLabel(input.comments, "Comment") })
  }
  if (!input.hideShare) {
    out.push({ kind: "share", label: "Share" })
  }
  out.push({ kind: "save", label: input.saved ? "Saved" : "Save" })
  return out
}

/**
 * The author line under the reel: "@handle" when the account has one, the
 * display name otherwise.
 *
 * The same fallback the Android card's header makes, with the "@" only where
 * there is a handle to put it on — "@Ada Lovelace" is not a thing. This
 * matters more on the web than on the phone: `/v1/feed/reels` hydrates its
 * `author` from user-service's public-profile allowlist, and `username` is
 * `omitempty` there. Every reel the live stack returned today came back with
 * a `display_name` and NO `username`, so this fallback is the normal path
 * here rather than an edge case.
 */
export function reelAuthorLabel(username?: string | null, displayName?: string | null): string {
  const handle = username?.replace(/^@/, "").trim()
  if (handle) return `@${handle}`
  const name = displayName?.trim()
  return name || "Someone"
}

/**
 * Whether this surface should draw the follow control for an author.
 *
 * ── The half taken from Android, unchanged ────────────────────────────────
 * Never for the viewer's own reel, and never while the edge is still UNKNOWN.
 * `edge` is undefined until `relationships/batch` answers, and Android's
 * `offersFollow` refuses to guess for a reason worth repeating: a Follow
 * button that appears and then vanishes when the real answer lands is worse
 * than one that arrives late, because the person in between has been told
 * something false about who they follow.
 *
 * ── The half that is deliberately different ───────────────────────────────
 * Android hides the control once the edge IS "following": its rule is
 * `edge == FollowStatus.NONE`, so the pill disappears the moment you press
 * it. That works on the phone because the author row is one tap from their
 * profile, which is where you would go to undo it.
 *
 * On the web there is no profile zone yet. Hiding the control here would make
 * a follow taken on this surface impossible to undo ANYWHERE — a one-way
 * action behind a single unconfirmed press, on a control people press by
 * accident while reaching for a video. So once the edge is known the control
 * stays, and says which of the three states it is in.
 *
 * That is also what `@momentum/interactions`' FollowButton is built for: it
 * has three states rather than two precisely so "Following" and "Requested"
 * can be rendered, and a caller that only ever passed it "none" would be
 * using a third of it.
 */
export function showsFollow(
  viewerId: string | null,
  authorId: string | undefined,
  edge: "none" | "following" | "requested" | undefined
): boolean {
  if (!authorId || !viewerId) return false
  if (authorId === viewerId) return false
  return edge !== undefined
}
