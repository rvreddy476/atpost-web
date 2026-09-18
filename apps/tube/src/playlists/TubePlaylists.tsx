"use client"

/**
 * `/tube/playlists` — the viewer's own playlists, and the way to make one.
 *
 * `GET /v1/creators/{viewerId}/playlists`. There is no "my playlists" route on
 * this gateway; that one takes any user id and the viewer's own is a user id,
 * so this is the route used as intended rather than a workaround. ./api.ts has
 * the table.
 *
 * ── Watch later is shown here, not hidden ─────────────────────────────────
 * The reserved queue IS a playlist (./playlists.ts has the whole argument for
 * why it is built that way), and it appears in this list with the rest,
 * marked. Hiding it would mean somebody with a Watch later could see a list of
 * "all your playlists" that did not contain one of them — and would have no
 * way to delete a duplicate if two tabs ever raced into making two.
 *
 * ── What this page does NOT offer ─────────────────────────────────────────
 * No rename and no visibility change. post-service has `POST`, `GET`, `DELETE`
 * and the two item routes, and no PATCH on a playlist at all — so a rename
 * control would be a control with nothing behind it, which is the one thing
 * this zone's rail rule forbids. It is flagged in the handover instead.
 */

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Clock, ListVideo, Plus, Trash2 } from "lucide-react"
import { useSession } from "@atpost/api-client/session"
import { createPlaylist, deletePlaylist, fetchMyPlaylists } from "./api"
import {
  playlistCountLabel,
  playlistHref,
  visibilityLabel,
  type TubePlaylist,
} from "./playlists"
import { BrowseError, EmptyCard, PageHeader, SignInCard } from "@/browse/states"

export function TubePlaylists() {
  const session = useSession()
  const viewerId = session.user?.id ?? null

  const [rows, setRows] = useState<TubePlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [title, setTitle] = useState("")
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (session.status === "unknown") return
    if (!viewerId) {
      setLoading(false)
      return
    }
    let live = true
    setLoading(true)
    setError(null)
    fetchMyPlaylists(viewerId)
      .then((found) => {
        if (live) setRows(found)
      })
      .catch(() => {
        if (live) setError("Your playlists could not be loaded.")
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [viewerId, session.status, reload])

  const create = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const name = title.trim()
      if (!name || busy) return
      setBusy(true)
      setNotice(null)
      try {
        const made = await createPlaylist(name, "private")
        if (!made) throw new Error("no row")
        // Prepended rather than refetched: the server sorts `created_at DESC`,
        // so the newest is the first row, and a refetch would be a round trip
        // to learn something already known.
        setRows((prev) => [made, ...prev])
        setTitle("")
        setNotice(`"${made.title}" created.`)
      } catch {
        setNotice("That playlist could not be created.")
      } finally {
        setBusy(false)
      }
    },
    [busy, title]
  )

  const remove = useCallback(
    async (row: TubePlaylist) => {
      // A real confirm, because this is the one destructive act on the page
      // and there is no undo route behind it: `DELETE /v1/playlists/{id}` is
      // final and takes the items with it.
      if (!window.confirm(`Delete "${row.title}"? The videos stay on Momentum.`)) return
      const was = rows
      setRows((prev) => prev.filter((other) => other.id !== row.id))
      try {
        await deletePlaylist(row.id)
        setNotice(`"${row.title}" deleted.`)
      } catch {
        setRows(was)
        setNotice("That playlist could not be deleted.")
      }
    },
    [rows]
  )

  if (session.signedOut) {
    return (
      <div>
        <PageHeader title="Playlists" />
        <SignInCard
          what="Sign in to see your playlists"
          why="A playlist belongs to an account, so Momentum has to know whose it is."
        />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Playlists"
        lede="Lists you have made, newest first. Watch later is one of them."
      />

      {/* The create form sits ABOVE the list rather than behind a button.
          There is one thing to do on an empty playlists page and hiding it
          behind a control is one press for nothing. */}
      <form onSubmit={create} className="mb-6 flex flex-wrap items-center gap-2">
        <label htmlFor="new-playlist" className="sr-only">
          New playlist name
        </label>
        <input
          id="new-playlist"
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={120}
          placeholder="New playlist name"
          className="h-10 min-w-0 flex-1 rounded-mo-pill border border-mo bg-mo-sunken px-4 text-sm text-mo-ink outline-none placeholder:text-mo-body focus-visible:border-mo-focus focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo sm:max-w-sm"
        />
        <button
          type="submit"
          disabled={busy || title.trim().length === 0}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-mo-pill border border-mo-strong px-4 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised disabled:opacity-50"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          Create
        </button>
        {/* Said where the choice is made, because the server's default is the
            opposite — see createPlaylist in ./api.ts. */}
        <p className="basis-full text-xs text-mo-body">
          New playlists are private.
        </p>
      </form>

      {notice && (
        <p role="status" className="mb-4 text-sm text-mo-body">
          {notice}
        </p>
      )}

      {loading ? (
        <ul aria-hidden="true" className="space-y-2">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="h-16 animate-pulse rounded-mo bg-mo-raised motion-reduce:animate-none"
            />
          ))}
        </ul>
      ) : error ? (
        <BrowseError message={error} onRetry={() => setReload((n) => n + 1)} />
      ) : rows.length === 0 ? (
        <EmptyCard
          icon={ListVideo}
          title="No playlists yet"
          body="Name one above, or use the menu on any video card to save it into a new list."
        />
      ) : (
        <ul aria-label="Your playlists" className="space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-3 rounded-mo border border-mo bg-mo-surface p-3 transition-colors duration-150 ease-mo hover:border-mo-strong"
            >
              {/* The link and the Delete button are SIBLINGS, never nested: a
                  control inside a control is invalid, and browsers disagree
                  about what a click on the inner one does. ../browse/
                  VideoCard.tsx makes the same split for the same reason. */}
              <Link
                href={playlistHref(row.id)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-mo outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
              >
                <span
                  aria-hidden="true"
                  className="grid h-12 w-20 shrink-0 place-items-center rounded-mo-sm bg-mo-sunken text-mo-body"
                >
                  {row.reserved ? (
                    <Clock className="h-5 w-5" />
                  ) : (
                    <ListVideo className="h-5 w-5" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-mo-ink">
                    {row.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-mo-body">
                    {playlistCountLabel(row.count)}
                    {visibilityLabel(row.visibility) && ` · ${visibilityLabel(row.visibility)}`}
                    {/* Named rather than hidden. See the header. */}
                    {row.reserved && " · Your Watch later queue"}
                  </span>
                </span>
              </Link>

              <button
                type="button"
                onClick={() => void remove(row)}
                aria-label={`Delete ${row.title}`}
                className="shrink-0 rounded-mo-pill p-2 text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
