/**
 * How a post that has just been written reaches the list it belongs at the top
 * of — and how it leaves again when the server refuses it.
 *
 * ── Why these two are not in the same component ───────────────────────────
 * The composer is mounted in the LAYOUT, because the button that opens it is
 * in the left rail and the rail is in the frame. The feed is mounted in the
 * PAGE, and it is the only thing that owns a list of posts (`useTabbedFeed`).
 * They are siblings with the page's tree between them, so there is no prop to
 * pass and no common ancestor short of the layout itself — and lifting the
 * feed's list into the layout would put a cursor-paged, per-tab cache above
 * the route that uses it.
 *
 * Three ways out: a React context in the layout (every consumer re-renders on
 * every keystroke of the composer, because the draft would live in the same
 * provider), a DOM CustomEvent (untyped, and a string nobody can grep for), or
 * this — a module-level subscription, typed, in one file, with the payload
 * named. It is the smallest of the three and the only one a test can drive
 * without a renderer.
 *
 * ── The optimistic post is a FeedItem, and it is honest about what it is ──
 * `optimisticItem` builds the row the card will draw before the server has
 * answered. Everything in it is either something the person typed or a server
 * default this client is certain of; nothing is a guess about a number. The
 * counts are zero because a post that does not exist yet has no likes, and
 * `is_processing` is true when it carries media, because the media genuinely
 * is.
 *
 * The id is a temporary one and is REPLACED, not merged, when the server
 * answers with the real post — see `PUBLISHED`. A card keyed on a temporary id
 * that later becomes permanent would remount; a card whose id never becomes
 * real would break every action on it (like, save, report all take the post
 * id), which is why a failed create removes the row rather than leaving it.
 */

import type { FeedItem } from "@atpost/types/feed"
import type { CreatedPost, Visibility } from "./api"

/** What the feed is told when a post enters, changes id, or is withdrawn. */
export type PublishEvent =
  /** A post has been sent and should appear at the top of the list. */
  | { kind: "optimistic"; item: FeedItem }
  /** The server accepted it: swap the temporary row for the real one. */
  | { kind: "confirmed"; tempId: string; item: FeedItem }
  /** The server refused it: take the temporary row back out. */
  | { kind: "withdrawn"; tempId: string }

type Listener = (event: PublishEvent) => void

const listeners = new Set<Listener>()

/** Subscribe. Returns the unsubscribe, for an effect's cleanup. */
export function onPublish(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Announce.
 *
 * Iterates a COPY of the set: a listener that unsubscribes while it is being
 * called — which is exactly what a feed unmounting mid-publish does — would
 * otherwise mutate the set being iterated.
 */
export function publish(event: PublishEvent): void {
  for (const listener of [...listeners]) listener(event)
}

/** The temporary id's shape, so a reader can tell one at a glance in devtools. */
export function tempPostId(): string {
  return `pending-${globalThis.crypto?.randomUUID?.() ?? String(Date.now())}`
}

/**
 * The row the feed draws while the server is deciding.
 *
 * `content_type: "post"` even when there is a video attached, and that is not
 * laziness: it is what this client ASKED for, and post-service will classify
 * the real one from the measurement. Claiming "long_video" here would draw a
 * different card for a second and then change it.
 *
 * No `media` array. The attachments have media ids by now, but a `FeedMedia`
 * needs signed `variants` to render and this client has none — the gateway
 * signs them when it serves the post. An invented entry would draw a broken
 * image; an absent one draws the text, which is true and complete for the
 * moment it is on screen. The confirmed row that replaces it comes from the
 * server and has whatever the server has.
 */
export function optimisticItem(args: {
  id: string
  authorId: string
  text: string
  visibility: Visibility
  hasMedia: boolean
  /** The viewer's own name and face, so the card does not draw a stranger. */
  author?: FeedItem["author"]
}): FeedItem {
  return {
    id: args.id,
    author_id: args.authorId,
    text: args.text,
    visibility: args.visibility,
    content_type: "post",
    created_at: new Date().toISOString(),
    counts: { likes: 0, comments: 0 },
    repost_count: 0,
    // It is being processed exactly when it carries something to process.
    is_processing: args.hasMedia,
    author: args.author,
  }
}

/** The server's answer, as a row the same list can hold. */
export function confirmedItem(post: CreatedPost, optimistic: FeedItem): FeedItem {
  return {
    ...optimistic,
    id: post.id,
    // The server is authoritative about all four, and about `created_at` in
    // particular: this client's clock is not the one the feed sorts by.
    ...(post.text === undefined ? {} : { text: post.text }),
    ...(post.visibility ? { visibility: post.visibility } : {}),
    ...(post.created_at ? { created_at: post.created_at } : {}),
    ...(post.content_type ? { content_type: post.content_type as FeedItem["content_type"] } : {}),
  }
}
