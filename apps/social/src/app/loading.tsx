/**
 * What the column shows while a route in this zone is still on its way.
 *
 * ── The same skeleton the feed uses, on purpose ───────────────────────────
 * `FeedSkeleton` has the card's proportions — a header row, a body, a media
 * block at the ratio a card uses — which is most of what stops a loading
 * state feeling cheap: a skeleton whose shape differs from the content causes
 * a jump the moment the content arrives. Using the feed's own means the
 * hand-off from this boundary to the client component's first paint is
 * invisible, because it is the same markup twice.
 *
 * ── Why this is worth a file when the feed already has a skeleton ─────────
 * The feed's skeleton starts when the feed's JavaScript is running. This one
 * covers the window before that: the segment's own code and data are still in
 * flight, and without a `loading.tsx` Next has nothing to show for it and the
 * centre column is empty. It is also the Suspense boundary `app/search` had
 * to declare by hand — the search page wraps itself in `<Suspense>` with this
 * exact fallback — so this is that decision applied to the whole zone rather
 * than to one route that needed it first.
 *
 * `aria-hidden` lives inside `FeedSkeleton`: pulsing grey boxes are not
 * content and announcing them would be noise. The page's heading arrives with
 * the real content a moment later.
 */

import { FeedSkeleton } from "@momentum/content"

export default function Loading() {
  return <FeedSkeleton />
}
