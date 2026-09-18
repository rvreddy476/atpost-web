/**
 * What a shared `/tube/{postId}` link looks like before anyone clicks it.
 *
 * NOT a client module — no "use client", no React, no window. It is imported by
 * `generateMetadata` in the two watch routes, which run on the server, and by
 * its own test. The decisions are here and the network is in ./serverPost.ts,
 * so the rule that matters can be asserted as a table rather than mocked.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE THAT MATTERS: A PREVIEW IS A PUBLICATION
 *
 * Every tag below is emitted into HTML that is served to anybody who asks for
 * the URL — a crawler, a link unfurler in a group chat, an archive. There is no
 * viewer behind it and no session to check, so a title in a `<meta>` is a title
 * the whole internet has. That is a different act from rendering the same title
 * to a signed-in person who was already allowed to see it, and it is why
 * `publicPreview` fails CLOSED at every step:
 *
 *   · the row is read ANONYMOUSLY (./serverPost.ts sends no cookie), so
 *     post-service's own visibility gate has already answered the question
 *     "what may a stranger see" before this function is called at all. A
 *     private, followers-only, gated, flagged, still-processing, scheduled or
 *     deleted post comes back as a 404 and never reaches here;
 *
 *   · and then `visibility` must be exactly `public`. That second check is not
 *     redundant, because the server admits `unlisted` to an anonymous reader —
 *     deliberately, an unlisted video is meant to work for anyone holding the
 *     link — and "works for anyone holding the link" is precisely NOT "put the
 *     title in a search index". Unlisted gets the page and no preview.
 *
 * An empty `visibility` is refused too, although the server reads it as public.
 * The Tube composer rewrites visibility to `public` on publish, so a blank one
 * is a row that did not come from the publish path, and guessing in the
 * permissive direction about a row nobody recognises is the wrong way to be
 * wrong about this.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE POSTER, AND THE ONE THING THAT DOES NOT WORK YET
 *
 * `og:image` is `…/v1/media/{id}/serve/{variant}` — the canonical, stable
 * address of a rendition, and the only one that is stable: the `variants` map
 * on a feed row is signed for 300 seconds, which is shorter than the gap
 * between a link being posted and an unfurler fetching it, let alone than the
 * weeks a social platform caches a card for.
 *
 * media-service will currently REFUSE that request to a crawler. Post media is
 * protected-class, and its content authorizer is constructed without
 * `allowAnonymous` — the profile and commerce authorizers set it, the post one
 * does not — so an anonymous `serve` is `no viewer` → denied. The tag is still
 * emitted, because it is the correct URL and it costs a card its picture rather
 * than showing a wrong one, and because the fix is one flag on one constructor
 * on the service that owns the audience decision. It is written down here and
 * in the handover rather than quietly worked around with a second URL shape
 * that this zone would then own for ever.
 */

import type { Metadata } from "next"

/* ── The row, as `GET /v1/posts/{id}` answers it ────────────────────────── */

/**
 * One attached asset. `PostMedia` in post-service — deliberately NOT
 * `FeedMedia`: this endpoint carries no variants, no blurhash and no
 * dimensions, which is the whole reason the watch page itself walks the feed
 * instead (see the header of ./api.ts). For a preview it carries enough.
 */
export interface PostRowMedia {
  media_id: string
  kind: string
  alt_text?: string
  position?: number
  duration_ms?: number
  processing_status?: string
  moderation_status?: string
}

/** The author's Tube channel, attached to `long_video` posts that have one. */
export interface PostRowChannel {
  user_id?: string
  name?: string
  handle?: string
}

export interface PostRow {
  id: string
  author_id?: string
  text?: string
  title?: string
  seo_title?: string
  visibility?: string
  content_type?: string
  review_status?: string
  language?: string
  tags?: string[]
  hashtags?: string[]
  cover_media_id?: string | null
  deleted_at?: string | null
  publish_at?: string | null
  published_at?: string | null
  is_scheduled?: boolean
  is_processing?: boolean
  body_redacted?: boolean
  tier_required_id?: string | null
  created_at?: string
  media?: PostRowMedia[]
  channel?: PostRowChannel | null
}

/* ── May this row be described to a stranger? ───────────────────────────── */

/**
 * The gate, as one predicate, so the answer can be read in one place.
 *
 * Every clause is a separate reason and every one of them is "no preview",
 * never "no page": a followers-only video still renders perfectly for a
 * follower, it simply has nothing to say to an unfurler.
 */
export function publicPreview(post: PostRow | null | undefined): post is PostRow {
  if (!post || !post.id) return false
  // The author took it down. The row survives the soft-delete window; the
  // preview must not.
  if (post.deleted_at) return false
  // Written but not live. `publish_at` is the stored schedule and
  // `is_scheduled` is derived from it — either one is enough.
  if (post.is_scheduled || post.publish_at) return false
  // Still transcoding, or waiting on a moderation verdict. Both are already
  // author-only at the server; both are checked here because "the server would
  // have hidden it" is a claim about another codebase.
  if (post.is_processing) return false
  if (post.review_status && post.review_status !== "approved") return false
  // Members-only. The anonymous read redacts the body, and a description built
  // from a redacted body is either empty or, worse, stale cache.
  if (post.tier_required_id || post.body_redacted) return false
  // And the one that is not inherited from the server: unlisted is reachable
  // and is not publishable. See the header.
  return (post.visibility ?? "").toLowerCase() === "public"
}

/**
 * Is there anybody this page could possibly be for?
 *
 * The routes use it to choose between rendering the app and `notFound()`, and
 * the rule is narrow on purpose:
 *
 *   · a SIGNED-IN request always renders. The anonymous probe says nothing
 *     about what this viewer may see — a followers-only video 404s to a
 *     stranger and plays perfectly for a follower — and `WatchScreen` already
 *     distinguishes "not yours to see" from "failed" on the client, with
 *     wording that took some care (see ./states.tsx);
 *
 *   · a SIGNED-OUT request for a video no stranger can read is a real 404.
 *     Nobody is going to sign in inside this page load, the client would have
 *     rendered "Sign in to watch" over a video that may not exist, and a
 *     crawler would have indexed that shell. A 404 is both the truthful status
 *     line and the one that stops the empty page being cached.
 *
 * It lives here rather than beside `generateMetadata` so it stays free of
 * `next/headers` and can be asserted directly.
 */
export function shouldRenderWatchPage(input: {
  signedIn: boolean
  post: unknown | null
}): boolean {
  return input.signedIn || input.post !== null
}

/* ── The words ──────────────────────────────────────────────────────────── */

/** Collapse newlines and runs of space; a meta tag is one line by definition. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim()
}

/**
 * Cut at a word boundary and say so with an ellipsis.
 *
 * A hard slice mid-word is how a description ends in "…the complete guide to
 * photog". The ellipsis is a real character rather than three dots so it
 * measures as one and cannot be split by a further clamp.
 */
export function clamp(text: string, max: number): string {
  const line = oneLine(text)
  if (line.length <= max) return line
  const cut = line.slice(0, max - 1)
  const space = cut.lastIndexOf(" ")
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * The name of the video.
 *
 * `seo_title` is the field whose entire purpose is this, so it wins; then the
 * composer's `title`; then the first line of the description, which is what a
 * video posted without a title actually reads as. `null` when there is nothing
 * — the caller then uses the site title rather than printing "Untitled".
 */
export function videoTitleFor(post: PostRow): string | null {
  const candidates = [post.seo_title, post.title, (post.text ?? "").split("\n")[0]]
  for (const candidate of candidates) {
    const line = oneLine(candidate ?? "")
    if (line) return clamp(line, 70)
  }
  return null
}

/**
 * The description, which is the post's text minus whatever became the title.
 *
 * Repeating the title as the description is the commonest unfurl mistake and
 * it wastes the only two lines a card has. When the text's first line WAS the
 * title, the rest is the description; when the title came from elsewhere, all
 * of the text is.
 */
export function videoDescriptionFor(post: PostRow, fallback: string): string {
  const text = (post.text ?? "").trim()
  if (!text) return fallback
  const named = post.seo_title || post.title
  const body = named ? text : text.split("\n").slice(1).join(" ").trim()
  return clamp(body || text, 200)
}

/* ── The picture, and the clock ─────────────────────────────────────────── */

/** The first video attachment, in carousel order. A long video has exactly one. */
export function primaryVideoMedia(post: PostRow): PostRowMedia | undefined {
  return [...(post.media ?? [])]
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .find((m) => m.kind === "video")
}

/**
 * Which asset the card's picture comes from, and at which rendition.
 *
 * The creator's chosen cover frame first: it is a full-size IMAGE asset, so it
 * has the 1080px rendition a large card wants. Failing that, the video's own
 * `thumb_300`, which is the largest still the video ladder produces
 * (`DefaultVideoRenditions`: thumb_150 and thumb_300, and nothing bigger).
 *
 * That size difference is why the Twitter card type is not hard-coded — see
 * `watchMetadata`. A 300px-wide still under `summary_large_image` is a blurred
 * banner, and `summary` is the honest card for it.
 */
export function posterFor(post: PostRow): { path: string; large: boolean } | null {
  if (post.cover_media_id) {
    return {
      path: `/v1/media/${encodeURIComponent(post.cover_media_id)}/serve/medium_1080`,
      large: true,
    }
  }
  const video = primaryVideoMedia(post)
  if (!video?.media_id) return null
  return {
    path: `/v1/media/${encodeURIComponent(video.media_id)}/serve/thumb_300`,
    large: false,
  }
}

/** Whole seconds, for `og:video:duration`, or undefined when unknown. */
export function durationSeconds(post: PostRow): number | undefined {
  const ms = primaryVideoMedia(post)?.duration_ms
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms <= 0) return undefined
  return Math.round(ms / 1000)
}

/* ── The tags ───────────────────────────────────────────────────────────── */

export interface WatchMetadataInput {
  post: PostRow | null
  postId: string
  /** `https://momentum.example` — scheme and host, no trailing slash. */
  origin: string
  /** This zone's basePath, e.g. `/tube`. The canonical URL is origin + this. */
  basePath: string
  /** The product name, for `og:site_name` and the fallback title. */
  siteName: string
  /** The site-level description, used when the post says nothing usable. */
  fallbackDescription: string
}

/**
 * The metadata for one watch page.
 *
 * Two shapes come out of it and only two. A describable video gets the full
 * card and `index`; anything else — missing, refused, private, unlisted,
 * scheduled, deleted — gets the site's own title, no description of the video,
 * no picture, and `noindex, nofollow`. There is deliberately no middle state
 * where a title is emitted without a picture "because we have the title
 * anyway": the title is the leak.
 *
 * Absolute URLs are built here rather than left relative for `metadataBase` to
 * resolve. Under a zone basePath the two are easy to get wrong in opposite
 * directions — `metadataBase` carries the origin and `next/link` carries the
 * basePath — and a canonical URL that is wrong is worse than one that is
 * absent, because a search engine believes it.
 */
export function watchMetadata(input: WatchMetadataInput): Metadata {
  const { post, postId, origin, basePath, siteName, fallbackDescription } = input
  const canonical = `${origin}${basePath}/${postId}`

  if (!publicPreview(post)) {
    return {
      title: siteName,
      description: fallbackDescription,
      alternates: { canonical },
      // Nothing here describes the video, so there is nothing to index and no
      // link worth following out of a page a stranger cannot read.
      robots: { index: false, follow: false },
      openGraph: {
        type: "website",
        siteName,
        url: canonical,
        title: siteName,
        description: fallbackDescription,
      },
      twitter: { card: "summary", title: siteName, description: fallbackDescription },
    }
  }

  const title = videoTitleFor(post) ?? siteName
  const description = videoDescriptionFor(post, fallbackDescription)
  const poster = posterFor(post)
  const image = poster ? `${origin}${basePath}${poster.path}` : undefined
  const channel = post.channel?.name?.trim() || undefined
  const seconds = durationSeconds(post)
  const released = post.published_at || post.created_at

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      // `video.other` is Open Graph's type for a video that is not an episode
      // of anything — it is what emits `og:type` and what unlocks
      // `og:video:duration` and `og:video:release_date` as valid properties.
      type: "video.other",
      siteName,
      url: canonical,
      title,
      description,
      ...(image ? { images: [{ url: image, alt: title }] } : {}),
      ...(seconds ? { duration: seconds } : {}),
      ...(released ? { releaseDate: released } : {}),
      ...(post.tags?.length || post.hashtags?.length
        ? { tags: [...(post.tags ?? []), ...(post.hashtags ?? [])].slice(0, 10) }
        : {}),
      ...(channel ? { authors: [channel] } : {}),
      ...(post.language ? { locale: post.language } : {}),
    },
    twitter: {
      // Large only when the picture is actually large. See `posterFor`.
      card: poster?.large ? "summary_large_image" : "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
    // The channel's name, for the readers that show a byline on a card. Not
    // `authors`, which Next maps to `<meta name="author">` and which a channel
    // is not quite — but it is the closest true statement available and a card
    // without it says only the site name.
    ...(channel ? { authors: [{ name: channel }] } : {}),
  }
}
