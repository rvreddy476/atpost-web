"use client"

/**
 * `/tube/saved`: the long videos this viewer has saved, newest first.
 *
 * ── "Saved videos", and not "Watch later" ─────────────────────────────────
 * The rail's essay (../chrome/rail.ts) records why: YouTube's word is Watch
 * later, this platform's is a BOOKMARK, drawn as "Save" on the watch page's
 * action bar and called Saved videos by the Android client. One list, one
 * word, on every surface. If the product ever splits Watch later from Save
 * this page gets a sibling rather than a rename.
 *
 * ── Remove is the watch page's Save button, pressed the other way ─────────
 * `setBookmark(id, false)` in ../tube/api.ts, the same DELETE the action
 * bar sends. Optimistic, for the reason the history page gives: a Remove
 * that waits for the network reads as a button that did nothing. Rolled
 * back to the same index on failure, with a status line.
 *
 * ── The list is the `/v1/posts` family, so the cards may be thinner ───────
 * `GET /v1/posts/bookmarks` answers PostDetail rows, which ../tube/api.ts
 * records as carrying no `variants`, no `blurhash` and no `channel` on the
 * public shelf. If the same is true here a card draws its title, its age
 * and its duration and no poster. The card already tolerates that (see
 * ../browse/VideoCard.tsx, "No video attached" is a different case); the
 * first person to run this against a stack should note what the rows carry.
 */

import { useCallback, useEffect, useState } from "react"
import { useSession } from "@atpost/api-client/session"
import type { FeedItem } from "@atpost/types/feed"
import { Bookmark, BookmarkX } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { VideoCard } from "@/browse/VideoCard"
import { VIDEO_GRID } from "@/browse/grid"
import { BrowseError, BrowseSkeleton } from "@/browse/states"
import { TUBE_SIGN_IN_HREF } from "@/chrome/links"
import { setBookmark } from "@/tube/api"
import { fetchSavedPage } from "./api"

const ACTION =
  "mt-5 inline-block rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold " +
  "text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"

const LOAD_MORE =
  "rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan " +
  "transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:cursor-not-allowed disabled:opacity-50"

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      {children}
    </div>
  )
}

export function TubeSaved() {
  const session = useSession()
  const [items, setItems] = useState<FeedItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    if (session.status === "unknown") return
    if (!session.signedIn) {
      setLoading(false)
      return
    }
    let live = true
    setLoading(true)
    setError(null)
    fetchSavedPage()
      .then((page) => {
        if (!live) return
        setItems(page.items)
        setCursor(page.nextCursor)
      })
      .catch(() => {
        if (live) setError("Your saved videos could not be loaded.")
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [session.signedIn, session.status, reload])

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    setNotice(null)
    fetchSavedPage(cursor)
      .then((page) => {
        setItems((prev) => {
          const seen = new Set(prev.map((i) => i.id))
          return [...prev, ...page.items.filter((i) => !seen.has(i.id))]
        })
        setCursor(page.nextCursor)
      })
      .catch(() => setNotice("More of your saved videos could not be loaded."))
      .finally(() => setLoadingMore(false))
  }, [cursor, loadingMore])

  const remove = useCallback((item: FeedItem) => {
    setNotice(null)
    let at = -1
    setItems((prev) => {
      at = prev.findIndex((i) => i.id === item.id)
      return prev.filter((i) => i.id !== item.id)
    })
    setBookmark(item.id, false).catch(() => {
      setItems((prev) => {
        if (prev.some((i) => i.id === item.id)) return prev
        const next = [...prev]
        next.splice(at < 0 ? next.length : Math.min(at, next.length), 0, item)
        return next
      })
      setNotice("That video could not be removed. It is still saved.")
    })
  }, [])

  return (
    <div>
      <header className="mb-5">
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
          Saved videos
        </h1>
        <p className="mt-1 text-sm text-mo-body">Long videos you saved, newest first.</p>
      </header>

      {session.signedOut ? (
        <Card>
          <Bookmark aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
          <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
            Sign in to see your saved videos
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-mo-body">
            {BRAND.name} keeps what you save against your account, so it has to know who you
            are.
          </p>
          <a href={TUBE_SIGN_IN_HREF} className={ACTION}>
            Sign in
          </a>
        </Card>
      ) : loading ? (
        <BrowseSkeleton />
      ) : error ? (
        <BrowseError message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : items.length === 0 ? (
        <Card>
          <Bookmark aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
          <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
            Nothing saved yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-mo-body">
            Save a video from its watch page and it appears here.
          </p>
          <a href="/tube" className={ACTION}>
            Browse videos
          </a>
        </Card>
      ) : (
        <>
          <ul className={VIDEO_GRID}>
            {items.map((item, at) => (
              <VideoCard
                key={item.id}
                item={item}
                position={at + 1}
                total={items.length}
                footer={
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => remove(item)}
                      className="inline-flex items-center gap-1 rounded-mo-pill px-2 py-1 text-xs font-semibold text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
                    >
                      <BookmarkX aria-hidden className="h-3.5 w-3.5" />
                      Remove from saved
                    </button>
                  </div>
                }
              />
            ))}
          </ul>

          {notice ? (
            <p role="status" className="mt-4 text-sm text-mo-body">
              {notice}
            </p>
          ) : null}

          {cursor ? (
            <p className="py-4 text-center">
              <button type="button" onClick={loadMore} disabled={loadingMore} className={LOAD_MORE}>
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </p>
          ) : (
            <p className="py-6 text-center text-sm text-mo-body">
              {items.length === 1
                ? "That is the only video you have saved."
                : `That is all ${items.length} videos you have saved.`}
            </p>
          )}
        </>
      )}
    </div>
  )
}
