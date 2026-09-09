"use client"

/**
 * `/tube/links` — your videos, each with the way into its links.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THIS PAGE EXISTS RATHER THAN A ROW ACTION ON AN EXISTING LIST
 *
 * The brief for this work says the editor should be reachable "from the
 * video's own row in Your videos". Two surfaces could carry that row and
 * neither is available to put it on:
 *
 *   · the left rail's "Your videos" is `/tube/@{handle}` — the channel page,
 *     which is a VIEWER's page. Its rows are `VideoCard`s built for a public
 *     grid and it lives in `src/channel/`, which this work does not own.
 *   · the upload studio is being built in parallel, in `src/studio/`, and
 *     owning the same file from two directions is how one of the two changes
 *     is lost.
 *
 * So the entry point is here, in this directory, and it is one link away from
 * the rail. When the studio lands, its own row action should point at
 * `/tube/links/{postId}` — the route is stable and takes nothing but a post id
 * — and this page can stay as the direct address or go, without either change
 * touching the editor.
 *
 * ── This is a list of what is LINKED, not a list of videos ────────────────
 * Which is the one thing a video grid could not say. Each row asks the two
 * cheap endpoints — `/cards` and `/end-screens` — so a creator can see at a
 * glance which of their videos have something attached. That is N+1 by
 * construction and it is bounded to one page of videos for exactly that
 * reason; the count is loaded after the rows are on screen, so the list itself
 * is never waiting on it.
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { AlertTriangle, Link2, SquarePen } from "lucide-react"
import { relativeTime } from "@momentum/content"
import { useSession } from "@atpost/api-client/session"
import { TUBE_SIGN_IN_HREF } from "@/chrome/links"
import { videoTitle } from "@/tube/video"
import { chapterClock } from "@/watch/timeline"
import { fetchCreatorVideos, fetchEndScreens, fetchVideoCards, videoDurationMs } from "./api"

interface Row {
  id: string
  title: string
  durationMs: number
  createdAt: string
  /** Null until the counts land. */
  linked: { cards: number; screens: number } | null
}

/** One page of videos. Same twelve `fetchAuthorVideos` pages at. */
const PAGE = 12

export function LinksIndex() {
  const { signedIn, status, user } = useSession()
  const [rows, setRows] = useState<Row[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unknown") return
    const creatorId = signedIn ? user?.id : null
    if (!creatorId) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    void fetchCreatorVideos(creatorId)
      .then((page) => {
        if (!alive) return
        const next = page.items.map((item) => ({
          id: item.id,
          title: videoTitle(item),
          durationMs: videoDurationMs(item),
          createdAt: item.created_at,
          linked: null,
        }))
        setRows(next)
        setCursor(page.nextCursor)
        setLoading(false)
        // Counts AFTER the list is on screen, and each one settles alone: a
        // failed count is a row with no badge, never a page that will not draw.
        for (const row of next) {
          void Promise.allSettled([fetchVideoCards(row.id), fetchEndScreens(row.id)]).then(
            ([cards, screens]) => {
              if (!alive) return
              setRows((current) =>
                current.map((r) =>
                  r.id === row.id
                    ? {
                        ...r,
                        linked: {
                          cards: cards.status === "fulfilled" ? cards.value.length : 0,
                          screens: screens.status === "fulfilled" ? screens.value.length : 0,
                        },
                      }
                    : r
                )
              )
            }
          )
        }
      })
      .catch(() => {
        if (!alive) return
        setProblem("Your videos could not be read just now.")
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [signedIn, status, user?.id])

  if (status === "unknown") return <Plate>Checking your session…</Plate>

  if (!signedIn) {
    return (
      <Plate>
        <p className="text-mo-body">Sign in to manage the links on your videos.</p>
        <a
          href={TUBE_SIGN_IN_HREF}
          className="mt-4 inline-block rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
        >
          Sign in
        </a>
      </Plate>
    )
  }

  return (
    <div>
      <header>
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
          Linked videos
        </h1>
        <p className="mt-1 max-w-2xl text-[13px] text-mo-body">
          Connect one of your videos to others: alternates that appear part-way
          through, a sequence a viewer can follow episode by episode, and a tile
          at the end.
        </p>
      </header>

      {loading && <Plate>Reading your videos…</Plate>}
      {problem && (
        <Plate>
          <AlertTriangle aria-hidden className="mx-auto h-8 w-8 text-mo-warn" />
          <p className="mt-3 text-mo-body">{problem}</p>
        </Plate>
      )}

      {!loading && !problem && rows.length === 0 && (
        <Plate>
          <p className="text-mo-body">
            You have not published a long video yet. Links are attached to a
            video, so this fills in once you have one.
          </p>
        </Plate>
      )}

      {rows.length > 0 && (
        <ul className="mt-5 divide-y divide-mo overflow-hidden rounded-mo border border-mo bg-mo-surface">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors duration-150 ease-mo hover:bg-mo-raised"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/${row.id}`}
                  className="block truncate text-[14px] font-semibold text-mo-ink transition-colors duration-150 ease-mo hover:text-mo-cyan focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
                >
                  {row.title}
                </Link>
                <p className="mt-0.5 text-[12px] text-mo-body">
                  {row.durationMs > 0 ? chapterClock(row.durationMs) : "Length unknown"}
                  {" · "}
                  {relativeTime(row.createdAt)}
                  {row.linked && (row.linked.cards > 0 || row.linked.screens > 0) && (
                    <>
                      {" · "}
                      <span className="inline-flex items-center gap-1 text-mo-cyan">
                        <Link2 aria-hidden className="h-3 w-3" />
                        {describeLinks(row.linked)}
                      </span>
                    </>
                  )}
                </p>
              </div>

              <Link
                href={`/links/${row.id}`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-mo-pill border border-mo-strong px-3 py-1.5 text-[13px] font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
              >
                <SquarePen aria-hidden className="h-4 w-4" />
                Manage links
              </Link>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <p className="mt-3 text-[12px] text-mo-body">
          Showing your {PAGE} most recent videos.
        </p>
      )}
    </div>
  )
}

function describeLinks({ cards, screens }: { cards: number; screens: number }): string {
  const parts: string[] = []
  if (cards > 0) parts.push(`${cards} card${cards === 1 ? "" : "s"}`)
  if (screens > 0) parts.push(`${screens} end screen${screens === 1 ? "" : "s"}`)
  return parts.join(", ")
}

function Plate({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-6 max-w-md rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      {children}
    </div>
  )
}
