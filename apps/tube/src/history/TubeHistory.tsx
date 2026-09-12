"use client"

/**
 * `/tube/history`: every long video this viewer has watched, newest first,
 * with where they got to.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT A HISTORY ROW IS, AND WHY REMOVE IS NOT COSMETIC
 *
 * There is one table. The row the watch page saves every ten seconds
 * (`POST /v1/videos/{id}/progress`, see ../watch/useResume.ts) is the row
 * this page lists, with the post joined on. So "Remove" is `DELETE
 * /v1/videos/{id}/progress`, and it does two things at once: the card
 * leaves this list, and the next time that video is opened it starts from
 * the beginning. The settings page says so beside its Clear control, and
 * this page says it once in the header line, because a person who removes
 * a row to tidy the list should not find out the other half by surprise.
 *
 * ── Day headings, and the list is not re-sorted ───────────────────────────
 * The rows arrive newest first and are grouped under Today, Yesterday and
 * the date as they arrive (./history.ts, `groupByDay`). A second page that
 * continues Yesterday joins the Yesterday already on screen. Nothing here
 * sorts, because a list with two opinions about "newest" shuffles rows the
 * person is looking at when the next page lands.
 *
 * ── Optimistic Remove, with the row put back where it was ─────────────────
 * The card goes on the click, not on the 204, because a Remove that waits
 * for the network reads as a button that did nothing. If the delete fails
 * the row is restored at its original index, not appended, so the list the
 * person was reading is the list they get back, and a status line says
 * what happened. A 404 is not a failure: the row was already gone.
 *
 * ── "Load more" is a button, not a sentinel ───────────────────────────────
 * The browse grid scrolls forever because browsing is what it is for. A
 * history is a list somebody is usually searching for one thing in, and a
 * page that keeps growing under a Clear button is a page where the button
 * moves while you reach for it.
 */

import { useCallback, useEffect, useState } from "react"
import { useSession } from "@atpost/api-client/session"
import { History as HistoryIcon, X } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { VideoCard } from "@/browse/VideoCard"
import { VIDEO_GRID } from "@/browse/grid"
import { BrowseError, BrowseSkeleton } from "@/browse/states"
import { TUBE_SIGN_IN_HREF } from "@/chrome/links"
import { clearHistory, fetchHistoryPage, removeFromHistory } from "./api"
import { ClearHistoryControl } from "./ClearHistoryControl"
import { groupByDay, progressFraction, resumeLine, type HistoryRow } from "./history"

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

export function TubeHistory() {
  const session = useSession()
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** A Remove that failed, said once, under the list. */
  const [notice, setNotice] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    // "unknown" is the beat before the session has read its own cookie.
    // Asking while signed out is a guaranteed 401 with a failed refresh
    // behind it, so nothing is asked until the answer is yes.
    if (session.status === "unknown") return
    if (!session.signedIn) {
      setLoading(false)
      return
    }
    let live = true
    setLoading(true)
    setError(null)
    fetchHistoryPage()
      .then((page) => {
        if (!live) return
        setRows(page.rows)
        setCursor(page.nextCursor)
      })
      .catch(() => {
        if (live) setError("Your history could not be loaded.")
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
    fetchHistoryPage(cursor)
      .then((page) => {
        // Ids already on screen are dropped: a row watched again between two
        // page loads moves to the top on the server and would otherwise be
        // drawn twice, under two days.
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.post.id))
          return [...prev, ...page.rows.filter((r) => !seen.has(r.post.id))]
        })
        setCursor(page.nextCursor)
      })
      .catch(() => setNotice("More of your history could not be loaded."))
      .finally(() => setLoadingMore(false))
  }, [cursor, loadingMore])

  const remove = useCallback(
    (row: HistoryRow) => {
      setNotice(null)
      let at = -1
      setRows((prev) => {
        at = prev.findIndex((r) => r.post.id === row.post.id)
        return prev.filter((r) => r.post.id !== row.post.id)
      })
      removeFromHistory(row.post.id).catch(() => {
        // Back where it was, not at the end: the list they were reading is
        // the list they get back.
        setRows((prev) => {
          if (prev.some((r) => r.post.id === row.post.id)) return prev
          const next = [...prev]
          next.splice(at < 0 ? next.length : Math.min(at, next.length), 0, row)
          return next
        })
        setNotice("That video could not be removed. It is back in the list.")
      })
    },
    []
  )

  const clear = useCallback(async () => {
    await clearHistory()
    setRows([])
    setCursor(null)
    setNotice(null)
  }, [])

  const groups = groupByDay(rows)

  return (
    <div>
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
            History
          </h1>
          <p className="mt-1 text-sm text-mo-body">
            Videos you have watched, newest first. Removing one also resets where it resumes
            from.
          </p>
        </div>
        {session.signedIn && !loading && !error ? (
          <ClearHistoryControl onClear={clear} empty={rows.length === 0} />
        ) : null}
      </header>

      {session.signedOut ? (
        <Card>
          <HistoryIcon aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
          <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
            Sign in to see your history
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-mo-body">
            {BRAND.name} keeps where you got to in each video against your account, so it has
            to know who you are.
          </p>
          <a href={TUBE_SIGN_IN_HREF} className={ACTION}>
            Sign in
          </a>
        </Card>
      ) : loading ? (
        <BrowseSkeleton />
      ) : error ? (
        <BrowseError message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : rows.length === 0 ? (
        <Card>
          <HistoryIcon aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
          <h2 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
            Nothing watched yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-mo-body">
            Open a video and it appears here, with where you got to.
          </p>
          <a href="/tube" className={ACTION}>
            Browse videos
          </a>
        </Card>
      ) : (
        <>
          {groups.map((group) => (
            <section key={group.label} aria-labelledby={`history-${group.label}`} className="mb-8">
              <h2
                id={`history-${group.label}`}
                className="mb-3 font-mo-display text-sm uppercase tracking-mo-eyebrow text-mo-body"
              >
                {group.label}
              </h2>
              <ul className={VIDEO_GRID}>
                {group.rows.map((row, at) => (
                  <VideoCard
                    key={row.post.id}
                    item={row.post}
                    position={at + 1}
                    total={group.rows.length}
                    footer={<ResumeFooter row={row} onRemove={() => remove(row)} />}
                  />
                ))}
              </ul>
            </section>
          ))}

          {notice ? (
            <p role="status" className="mb-4 text-sm text-mo-body">
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
              {rows.length === 1
                ? "That is the only video in your history."
                : `That is all ${rows.length} videos in your history.`}
            </p>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The resume line, the bar, and Remove: the card's footer slot.
 *
 * The bar is a real `role="progressbar"` with the percentage as its value,
 * so a screen reader hears "27 percent" rather than nothing, and the line
 * above it is the sentence a sighted person reads; the two are derived from
 * the same row by ./history.ts, so they cannot disagree.
 */
function ResumeFooter({ row, onRemove }: { row: HistoryRow; onRemove: () => void }) {
  const fraction = progressFraction(row)
  const percent = Math.round(fraction * 100)
  const line = resumeLine(row)
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-mo-body">{line}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove from history"
          className="inline-flex shrink-0 items-center gap-1 rounded-mo-pill px-2 py-1 text-xs font-semibold text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
          Remove
        </button>
      </div>
      <div
        role="progressbar"
        aria-label={line}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="mt-1.5 h-1 w-full overflow-hidden rounded-mo-pill bg-mo-raised"
      >
        <div className="h-full rounded-mo-pill bg-mo-cyan" style={{ width: `${percent}%` }} />
      </div>
    </div>
  )
}
