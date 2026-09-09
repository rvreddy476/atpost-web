"use client"

/**
 * `/tube/search` — what the top bar's box submits to.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS PAGE EXISTS AT ALL, GIVEN /social/search
 *
 * @momentum/chrome's SearchBox is emphatic that there is ONE results page on
 * the web, in the social zone, because "a second results page would be a
 * second opinion about the same index". This is a second page and it is not a
 * second opinion, for two reasons:
 *
 *   · ISOLATION. A search box in the Tube bar that throws the browser out of
 *     Tube and into the feed is the most visible possible way to break "it's
 *     a completely isolated application from the feed". A person searching
 *     inside a video app expects to still be in it afterwards.
 *
 *   · IT IS A DIFFERENT QUESTION. /social/search answers posts, people and
 *     hashtags. This answers VIDEO and CHANNELS — the two nouns this app has.
 *     Handing a Tube query to the feed's results page would answer it with
 *     photo posts and hashtags, which is a worse answer rather than the same
 *     one somewhere else.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TWO CALLS, AND WHY IT IS NOT ONE
 *
 *     GET /v1/channels/search?q=            channels — post-service's index
 *     GET /v1/search?q=&types=posts         videos   — search-service, grouped
 *
 * `/v1/search` DOES accept `types=channels` — the 400 for a bad value lists
 * posts, users, hashtags, products, communities, channels — and it answers
 * `{"channels":{"items":[]}}` for every query, including ones that
 * `/v1/channels/search` answers with three real channels. The search-service
 * channel index is empty on this stack. That is a finding, not a preference:
 * the day it is populated, the channel call folds into the other one and this
 * page makes a single request. Until then it asks the service that
 * demonstrably has the data.
 *
 * ── The video narrowing happens on the client, and it is imperfect ────────
 * The grouped branch of `/v1/search` has no video mode; the flat `type=videos`
 * branch has one but no documented shape and no cursors. So this asks for
 * posts and keeps the long ones (`isLongVideoRow` in ../tube/channelApi.ts,
 * which accepts both `long_video` and its legacy synonym `video`). The
 * consequence is real and the empty state says it plainly: the server pages
 * over ALL posts, so a query whose first page is entirely photos comes back
 * with no videos even though a later page might have one.
 *
 * ── The rows are search hits, not feed rows ───────────────────────────────
 * `SearchPostRow` carries a title, an author, a duration and a
 * `thumbnail_url` that is null for every long video on this stack. It has no
 * `media`, no blurhash and no variants, so these are drawn as compact rows
 * with a placeholder rather than as `VideoCard`s. A card whose poster is
 * always empty is a grid of grey rectangles pretending to be a gallery.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Search, Tv } from "lucide-react"
import { Avatar, formatDuration, relativeTime } from "@momentum/content"
import { channelHref } from "@/tube/channels"
import type { ChannelRef } from "@/tube/channels"
import { searchChannels, searchVideos, type SearchVideoRow } from "@/tube/channelApi"
import { videoHref } from "@/tube/video"

type Phase = "idle" | "loading" | "ready" | "failed"

export function TubeSearchResults({ query }: { query: string }) {
  const [phase, setPhase] = useState<Phase>(query ? "loading" : "idle")
  const [channels, setChannels] = useState<ChannelRef[]>([])
  const [videos, setVideos] = useState<SearchVideoRow[]>([])

  useEffect(() => {
    if (!query) {
      setPhase("idle")
      setChannels([])
      setVideos([])
      return
    }
    let live = true
    setPhase("loading")

    // `allSettled` and not `all`: the two calls hit different services, and
    // one of them failing must cost its own section rather than the page.
    // `all` would reject on the first failure and throw away a good answer
    // that had already arrived.
    Promise.allSettled([searchChannels(query), searchVideos(query)]).then(
      ([channelResult, videoResult]) => {
        if (!live) return
        setChannels(channelResult.status === "fulfilled" ? channelResult.value : [])
        setVideos(videoResult.status === "fulfilled" ? videoResult.value : [])
        setPhase(
          channelResult.status === "rejected" && videoResult.status === "rejected"
            ? "failed"
            : "ready"
        )
      }
    )

    return () => {
      live = false
    }
  }, [query])

  if (!query) {
    return (
      <Plate icon={<Search aria-hidden className="mx-auto h-8 w-8 text-mo-purple" />}>
        <PlateTitle>Search Momentum Tube</PlateTitle>
        <PlateBody>
          Type in the box above to find videos and channels. Nothing else on Momentum is searched
          from here.
        </PlateBody>
      </Plate>
    )
  }

  return (
    <div>
      <h1 className="mb-5 font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
        Results for “{query}”
      </h1>

      {phase === "loading" && (
        <ul aria-hidden className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <li key={i} className="flex animate-pulse gap-4">
              <div className="h-20 w-36 shrink-0 rounded-mo bg-mo-raised" />
              <div className="min-w-0 flex-1 pt-1">
                <div className="h-4 w-3/5 rounded bg-mo-raised" />
                <div className="mt-2 h-3 w-2/5 rounded bg-mo-raised" />
              </div>
            </li>
          ))}
        </ul>
      )}

      {phase === "failed" && (
        <div role="alert">
          <Plate icon={<AlertTriangle aria-hidden className="mx-auto h-8 w-8 text-mo-warn" />}>
            <PlateTitle>That search could not be run</PlateTitle>
            <PlateBody>Neither the video index nor the channel index answered.</PlateBody>
          </Plate>
        </div>
      )}

      {phase === "ready" && (
        <>
          {channels.length > 0 && (
            <section className="mb-8">
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-mo-body">
                Channels
              </h2>
              <ul className="space-y-2">
                {channels.map((channel) => (
                  <li key={channel.user_id}>
                    <Link
                      href={channelHref(channel.handle || channel.user_id)}
                      className="flex items-center gap-4 rounded-mo border border-mo bg-mo-surface px-4 py-3 transition-colors duration-150 ease-mo hover:bg-mo-raised outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
                    >
                      <Avatar
                        name={channel.name}
                        id={channel.user_id}
                        src={channel.avatar_url}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-mo-ink">
                          {channel.name}
                        </span>
                        {channel.handle && (
                          <span className="block truncate text-sm text-mo-body">
                            @{channel.handle}
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-mo-body">
              Videos
            </h2>
            {videos.length === 0 ? (
              <p className="py-8 text-mo-body">
                No long video matched “{query}” on the first page of results. Search covers every
                kind of post and this page keeps only the videos, so a more specific word often
                helps.
              </p>
            ) : (
              <ul className="space-y-3">
                {videos.map((row) => (
                  <VideoResult key={row.id ?? row.post_id} row={row} />
                ))}
              </ul>
            )}
          </section>

          {channels.length === 0 && videos.length === 0 && (
            <p className="py-4 text-sm text-mo-body">
              Nothing matched in videos or channels. Momentum searches people, posts and hashtags
              too — that search lives in the main app.
            </p>
          )}
        </>
      )}
    </div>
  )
}

/** One video hit: a placeholder, a title, who made it and how long it is. */
function VideoResult({ row }: { row: SearchVideoRow }) {
  const id = row.id ?? row.post_id
  if (!id) return null
  const title = (row.title ?? row.text ?? "").trim() || "Untitled video"
  const duration = formatDuration(row.duration_ms)

  return (
    <li>
      <Link
        href={videoHref({ id })}
        className="flex gap-4 rounded-mo p-1 transition-colors duration-150 ease-mo hover:bg-mo-surface outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
      >
        <span className="relative grid h-20 w-36 shrink-0 place-items-center overflow-hidden rounded-mo bg-mo-sunken">
          {row.thumbnail_url ? (
            /* Same reasoning as the grid's poster: a signed, already-sized URL
               is exactly the case next/image is wrong for — the optimizer
               caches the URL server-side and the cached copy outlives the
               credential inside it. It is null for every long video on this
               stack, so what is drawn today is the glyph. */
            // eslint-disable-next-line @next/next/no-img-element -- see above.
            <img
              src={row.thumbnail_url}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <Tv aria-hidden className="h-5 w-5 text-mo-muted-lg" />
          )}
          {duration && (
            <span className="absolute bottom-1 right-1 rounded-mo-sm bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-white">
              {duration}
            </span>
          )}
        </span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="line-clamp-2 block font-semibold leading-snug text-mo-ink">{title}</span>
          <span className="mt-1 block truncate text-sm text-mo-body">
            {row.author?.display_name?.trim() || "Someone"}
            {row.created_at ? ` · ${relativeTime(row.created_at)}` : ""}
          </span>
        </span>
      </Link>
    </li>
  )
}

function Plate({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      {icon}
      {children}
    </div>
  )
}

function PlateTitle({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
      {children}
    </h1>
  )
}

function PlateBody({ children }: { children: React.ReactNode }) {
  return <p className="mx-auto mt-2 max-w-sm text-mo-body">{children}</p>
}
