"use client"

/**
 * The top of a channel: who this is, how big they are, and the one decision
 * the page is asking you to make.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BANNER, AND THE QUESTION THE BRIEF ASKED
 *
 * "Check whether `GET /v1/profiles/{userId}` carries a cover image; if it
 * has one, use it as the channel banner." The answer, stated where somebody
 * will look for it:
 *
 *   · THE CALL IS WIRED. `fetchChannelProfileExtras` in ./api.ts reads that
 *     route and the moment it returns a URL-shaped cover, that picture is the
 *     banner. Nothing else has to change.
 *   · IT RETURNS NULL TODAY. `packages/types/src/profile.ts` declares
 *     `cover_media_id` and not a cover URL, and a media id is not something a
 *     browser can load — the URL derivable from one is unsigned and 403s, the
 *     same trap `avatar_media_id` sets. No surface in this repository resolves
 *     a media id to a signed URL from the browser. ../tube/channels.ts also
 *     records a 2026-09-09 read of this route that found no cover field at
 *     all. The gateway could not be re-checked while this was written —
 *     nothing was listening on `API_GATEWAY_URL` — so this is the repository's
 *     answer rather than the wire's, and it is written down as such.
 *
 * ── So the fallback had to be a DESIGN, not a placeholder ─────────────────
 * The brief's words were "design the header to look deliberate rather than
 * leaving a grey slab", and a grey slab is precisely what a missing image
 * usually becomes. What is drawn instead is a band of the channel's own
 * gradient — `bannerImage` in ../tube/channels.ts, FNV-1a over the handle, so
 * the same channel is the same colours on every visit and on every device and
 * two channels side by side are told apart at a glance — with the page's
 * ground faded in across its bottom edge so the band RESOLVES into the page
 * instead of stopping at a hard line. A hard-edged coloured rectangle reads as
 * an image that failed to load; a gradient that dissolves into the surface
 * below it reads as the page's own top. That one detail is the difference
 * between "no banner yet" and "this is what this channel looks like".
 *
 * The avatar then overlaps the band's lower edge, which is the shape both
 * YouTube and RUTUBE use and which does a second job here: it ties the
 * decorative band to the identity below it, so the band reads as belonging to
 * this channel rather than as page furniture.
 *
 * ── The owner sees Edit, and never Subscribe ──────────────────────────────
 * Decided from `user.id === channel.user_id` and nothing else — no extra
 * request, because the page already holds both. `useSubscription` separately
 * refuses to ask about the viewer's own channel, so the two agree by
 * construction: there is no arrangement of network answers in which a person
 * is offered a subscription to themselves.
 *
 * ── Share is the page's own URL ───────────────────────────────────────────
 * `navigator.share` where the browser has one, the clipboard where it does
 * not, and an honest sentence when neither works. Copied in structure from
 * ../watch/WatchScreen.tsx's `onShare` and ../menu/useCardActions.ts's, which
 * both had to solve the same basePath trap: the zone-relative href is "/@ada"
 * and a link shared as "/@ada" is a link to nothing, so the origin and the
 * zone prefix go back on by hand here.
 */

import { useCallback, useState } from "react"
import Link from "next/link"
import { Pencil, Share2 } from "lucide-react"
import {
  atHandle,
  bannerImage,
  subscribersLabel,
  videosLabel,
  type TubeChannel,
} from "@/tube/channels"
import type { SubscriptionEdge } from "@/tube/useSubscription"
import { SubscribeControls } from "./SubscribeControls"
import { aboutSummary } from "./about"

/** Button and link furniture, so the three controls in this header match. */
const PILL =
  "inline-flex items-center gap-2 rounded-mo-pill border border-mo px-4 py-2 text-sm font-semibold " +
  "text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"

/* ── The banner ───────────────────────────────────────────────────────────── */

/**
 * The band across the top: the creator's cover if there is one, else the
 * channel's own gradient. See the header for why the second case is a design
 * rather than a gap.
 */
function ChannelBanner({ channel, coverUrl }: { channel: TubeChannel; coverUrl: string | null }) {
  const [coverFailed, setCoverFailed] = useState(false)
  const cover = coverFailed ? null : coverUrl

  return (
    <div className="relative h-28 w-full overflow-hidden rounded-mo sm:h-44">
      {cover ? (
        /* A signed, already-sized URL is exactly the case next/image is wrong
           for: the optimizer caches the URL server-side, the cached copy
           outlives the credential inside it, and it then serves an error for a
           picture it can no longer re-fetch. @momentum/content's PostMedia has
           the argument; ../browse/VideoCard.tsx makes the same call. */
        // eslint-disable-next-line @next/next/no-img-element -- see above.
        <img
          src={cover}
          // Decoration. The channel's name is an h1 two lines below and an alt
          // here would be a second, worse name for the same thing.
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          // A signature that expired between the fetch and the paint. There is
          // nothing to repair, so it falls back to the gradient rather than
          // leaving a broken-image glyph across the top of somebody's channel.
          onError={() => setCoverFailed(true)}
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ backgroundImage: bannerImage(channel.handle || channel.user_id) }}
        />
      )}
      {/* The band dissolves into the page rather than stopping at a line. The
          one detail that makes a gradient read as a header instead of as a
          failed image — see the file header. */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-b from-transparent to-mo-bg"
      />
    </div>
  )
}

/* ── The avatar, at channel size ──────────────────────────────────────────── */

/**
 * 80px, and drawn here rather than by @momentum/content's `Avatar`.
 *
 * Not a preference and not a fork. That component offers `sm` (32) and `md`
 * (40) and nothing larger, and the way to get 80 out of it would be a
 * className that overrides its own `h-10 w-10` — which wins only by
 * stylesheet order. ../browse/VideoCard.tsx refused exactly that trick for
 * eight pixels and wrote down why: "40 is a token; 36 would be a guess that
 * breaks the day Tailwind sorts differently." A header avatar beside a 176px
 * banner is the one place in this zone that genuinely needs a third size, so
 * it is drawn honestly at that size instead of being coerced into it.
 *
 * The initial and the surface follow the shared component's rules — a letter
 * on a palette surface rather than a generated hue, because a hashed hue lands
 * on the ember red that means "primary action" for one channel in six.
 * Decorative in both branches: the channel's name is an h1 beside it.
 */
function ChannelAvatar({ channel }: { channel: TubeChannel }) {
  const name = channel.name?.trim() || channel.handle || ""
  const initial = (name.replace(/^@+/, "").trim()[0] ?? "?").toUpperCase()

  return (
    // A ring of the page's own ground, so the avatar reads as sitting ON the
    // banner rather than being cut out of it. Padding rather than `ring-*`
    // keeps this to background utilities, which are the ones this preset
    // definitely generates for every palette surface.
    <div className="shrink-0 rounded-mo-pill bg-mo-bg p-1">
      {channel.avatar_url ? (
        /* Signed and pre-sized: next/image would cache a URL that outlives its
           own credential. Same call as the banner above. */
        // eslint-disable-next-line @next/next/no-img-element -- see above.
        <img
          src={channel.avatar_url}
          alt=""
          className="h-20 w-20 rounded-mo-pill object-cover ring-1 ring-mo"
        />
      ) : (
        <div
          aria-hidden="true"
          className="flex h-20 w-20 items-center justify-center rounded-mo-pill bg-mo-raised font-mo-display text-3xl font-semibold text-mo-ink ring-1 ring-mo"
        >
          {initial}
        </div>
      )}
    </div>
  )
}

/* ── The header ───────────────────────────────────────────────────────────── */

export function ChannelHeader({
  channel,
  subscription,
  coverUrl,
  isOwner,
  videoCount,
}: {
  channel: TubeChannel
  subscription: SubscriptionEdge
  /** From `GET /v1/profiles/{user_id}`, or null — which is today's answer. */
  coverUrl: string | null
  /** Is the viewer looking at their own channel? Then Edit, never Subscribe. */
  isOwner: boolean
  /**
   * The channel's video count as the page can best state it: the counts
   * endpoint's number where it answered, the channel row's otherwise.
   */
  videoCount: number | null
}) {
  const handle = atHandle(channel.handle)
  // The EDGE's count and not the row's: they are the same number until the
  // viewer presses Subscribe, and from then on the edge's is the one that
  // moved with the press and was replaced by the server's answer.
  const subscribers = subscription.subscriberCount
  const about = aboutSummary(channel.about)
  const [expanded, setExpanded] = useState(false)
  const [shareNote, setShareNote] = useState<string | null>(null)

  const onShare = useCallback(() => {
    if (typeof window === "undefined") return
    // `channelHref` is zone-relative ("/@ada") because next/link adds the
    // basePath itself. A SHARED link has no Next in front of it, so the origin
    // and the zone prefix go back on here. See the file header.
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || ""
    const url = `${window.location.origin}${base}/@${channel.handle || channel.user_id}`
    const nav = window.navigator as Navigator & {
      share?: (data: { title?: string; url: string }) => Promise<void>
    }
    if (typeof nav.share === "function") {
      // A dismissed share sheet is somebody changing their mind, not an error.
      void nav.share({ title: channel.name, url }).catch(() => undefined)
      return
    }
    if (!nav.clipboard) {
      setShareNote("Copy the address from your browser's bar.")
      return
    }
    nav.clipboard
      .writeText(url)
      .then(() => setShareNote("Link copied."))
      .catch(() => setShareNote("Could not copy the link."))
  }, [channel.handle, channel.name, channel.user_id])

  return (
    <header className="mb-6">
      <ChannelBanner channel={channel} coverUrl={coverUrl} />

      {/* The avatar rides up over the band's lower edge — YouTube's and
          RUTUBE's shape, and the thing that ties the band to this identity. */}
      <div className="-mt-8 flex flex-wrap items-start gap-x-4 gap-y-3 px-1 sm:-mt-10 sm:px-4">
        {/* `avatar_url` is a real signed URL when the channel has one — unlike
            `avatar_media_id`, which is not a URL and whose derivable one is
            unsigned and 403s. Every channel on the dev stack has null here, so
            what is drawn today is the initial. */}
        <ChannelAvatar channel={channel} />

        <div className="min-w-0 flex-1 basis-[13rem] pt-8 sm:pt-10">
          <h1 className="break-words font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink sm:text-2xl">
            {channel.name || handle || "Channel"}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 break-words text-sm text-mo-body">
            {handle && <span>{handle}</span>}
            {handle && <span aria-hidden>·</span>}
            {/* Null means "we could not read it", which is not zero: a failed
                side request must not state a number about somebody's channel. */}
            {subscribers !== null && <span>{subscribersLabel(subscribers)}</span>}
            {subscribers !== null && <span aria-hidden>·</span>}
            <span>{videosLabel(videoCount)}</span>
          </p>

          {about.present && (
            <div className="mt-2 max-w-2xl">
              <p
                className={[
                  "whitespace-pre-wrap text-sm text-mo-body",
                  expanded ? "" : "line-clamp-2",
                ].join(" ")}
              >
                {about.text}
              </p>
              {about.expandable && (
                <button
                  type="button"
                  onClick={() => setExpanded((open) => !open)}
                  aria-expanded={expanded}
                  className="mt-1 rounded-mo-sm text-sm font-semibold text-mo-ink transition-colors duration-150 ease-mo hover:text-mo-cyan focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
                >
                  {expanded ? "less" : "more"}
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1 sm:pt-10">
          {isOwner ? (
            /* `next/link`, because /tube/settings is a route of this same app
               and it is where a channel's name, handle and about are edited
               (../settings/TubeSettings.tsx, `PATCH /v1/channels/me`). */
            <Link href="/settings" className={PILL}>
              <Pencil aria-hidden="true" className="h-4 w-4" />
              <span>Edit channel</span>
            </Link>
          ) : (
            /* Absent, not disabled, while the edge is UNKNOWN: it is undefined
               until `…/subscription` answers, and undefined forever for a
               signed-out browser. A Subscribe button that appears and then
               flips to Subscribed is worse than one that arrives late — the
               person in between has been told something false about their own
               subscriptions. `SubscribeControls` renders nothing on an unknown
               edge, so that rule lives in one place. */
            <SubscribeControls edge={subscription} name={channel.name} />
          )}

          <button type="button" onClick={onShare} className={PILL}>
            <Share2 aria-hidden="true" className="h-4 w-4" />
            <span>Share</span>
          </button>
        </div>
      </div>

      {/* Announced without stealing focus, and only ever after a press. */}
      {shareNote && (
        <p role="status" className="mt-2 px-1 text-sm text-mo-body sm:px-4">
          {shareNote}
        </p>
      )}
    </header>
  )
}
