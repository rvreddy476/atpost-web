/**
 * The one-video rule, extended to cover a video nobody's coordinator chose.
 *
 * ── The hole this fills ──────────────────────────────────────────────────
 * `autoplay.ts` guarantees that at most one item is `active`, structurally: it
 * returns a single id rather than a set, so two cards cannot both believe they
 * are the one. That guarantee is intact and nothing here weakens it.
 *
 * What it does not cover is a video playing for a reason the coordinator has
 * no opinion about. A play BUTTON creates exactly that: under
 * `prefers-reduced-motion` the coordinator is switched off and `activeId` is
 * null forever, so every video in the feed is inactive and any of them can be
 * started by hand. Without something to arbitrate, pressing play on three
 * cards would leave three videos playing over each other — the precise failure
 * the coordinator's header says must never come back, arriving through a door
 * the coordinator does not watch.
 *
 * ── Why a module-level registry and not React state ──────────────────────
 * The same reason the coordinator is a hook over a shared observer rather than
 * per-card state: the invariant is global to the document, and any
 * implementation that requires a common ancestor to hold it would break the
 * moment a second surface (a modal, a pinned player, tube's rail) mounts a
 * player outside that ancestor. One module, one holder, no provider to forget.
 *
 * It is deliberately NOT a way to ask "what is playing" — there is no getter
 * that returns the holder for rendering, because a component that read this to
 * decide what to draw would be the second source of truth the coordinator's
 * header forbids. It only revokes.
 */

/** Called on the previous holder when someone else claims. */
type Revoke = () => void

interface Holder {
  id: string
  revoke: Revoke
}

/**
 * The single holder. Module scope on purpose — see the header.
 *
 * `null` is the normal state: in a feed with autoplay enabled, playback is the
 * coordinator's business and nothing ever claims this.
 */
let holder: Holder | null = null

/**
 * Take manual playback, displacing whoever held it.
 *
 * `id` is the claimant's stable id, never an index — the same discipline
 * `elementToId` enforces in the coordinator, and for the same reason: a
 * registry keyed on position mis-revokes the moment the feed prepends a page.
 *
 * Re-claiming with the same id refreshes the revoke callback and does NOT call
 * it. A component whose `onRevoke` closure changed identity between renders
 * would otherwise pause itself.
 */
export function claimManualPlayback(id: string, revoke: Revoke): void {
  const previous = holder
  holder = { id, revoke }
  if (previous && previous.id !== id) previous.revoke()
}

/**
 * Give it up, if it is still ours.
 *
 * The `id` guard is what makes this safe to call from a cleanup that runs
 * AFTER another player has already claimed. React unmounts and mounts in an
 * order that regularly produces exactly that, and an unguarded release would
 * silently hand the new holder's slot away.
 */
export function releaseManualPlayback(id: string): void {
  if (holder?.id === id) holder = null
}

/**
 * "Something else is playing now" — the coordinator picked a card, so any
 * hand-started video that is not it must stop.
 *
 * Called with the id that is now `active`. Passing the id rather than clearing
 * unconditionally means the common case (the person pressed play on the card
 * that then became active) does not pause the video they just started.
 */
export function revokeManualPlaybackExcept(id: string | null): void {
  if (!holder) return
  if (id !== null && holder.id === id) return
  const previous = holder
  holder = null
  previous.revoke()
}

/** Tests only. There is no production reason to reach in here. */
export function __resetManualPlayback(): void {
  holder = null
}
