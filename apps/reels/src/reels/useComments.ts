"use client"

/**
 * The comment thread for one short: pages, writes, and the optimistic rows in
 * between.
 *
 * ── It is keyed on the short, and it keeps nothing when that changes ──────
 * The panel does not unmount when somebody swipes — that is the whole point of
 * it being a side sheet rather than a page — so this hook is what has to
 * notice. Every piece of state below is reset when `reelId` changes, and the
 * in-flight guard is cleared with it: a page of comments for the short you
 * just left, landing after you have moved on, would otherwise be merged into
 * the thread of the one you are looking at now.
 *
 * ── Why a hook here and not @momentum/content's CommentSheet ──────────────
 * That component is a complete comment surface and it is deliberately smaller
 * than this one: no like, no reply, no edit, no delete, and it is a centred
 * DIALOG on a wide viewport. Every one of those absences is argued for in its
 * own header and every one of the arguments is about a card in a feed. This
 * surface needs all four controls and needs to not steal the screen from a
 * playing video, so it is built here rather than by widening a shared
 * component past what its other callers asked for.
 *
 * What is NOT rebuilt is the vocabulary — the row lifecycle, the merge, the
 * error table and the draft rule are all imported.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  commentErrorMessage,
  discardComment,
  mergeComments,
  pendingComment,
  settleComment,
  type CommentRow,
} from "@momentum/content"
import {
  commentLikeCount,
  countDelta,
  removeComment,
  replaceComment,
} from "./comments"
import {
  createComment,
  deleteComment,
  editComment,
  failureOf,
  fetchComments,
  likeComment,
  replyToComment,
} from "./api"

export type CommentsStatus = "idle" | "loading" | "ready" | "error"

export interface CommentsThread {
  rows: CommentRow[]
  status: CommentsStatus
  loadingMore: boolean
  hasMore: boolean
  error: string
  /** comment id -> the viewer liked it in THIS session. See ./comments.ts. */
  liked: Map<string, boolean>
  likeCountOf: (row: CommentRow) => number
  loadMore: () => void
  retry: () => void
  post: (text: string) => Promise<boolean>
  reply: (commentId: string, text: string) => Promise<boolean>
  edit: (commentId: string, text: string) => Promise<boolean>
  remove: (commentId: string) => Promise<boolean>
  toggleLike: (commentId: string) => void
}

export interface UseCommentsOptions {
  reelId: string | null
  viewerId: string | null
  /** False for a signed-out browser: reads still work, writes do not. */
  canWrite: boolean
  /**
   * Told how the count on the rail should move, and by how much.
   *
   * Fired on the SERVER's answer for a create and on the optimistic write for
   * a delete — which is not an inconsistency. A create has a row to show
   * whether or not the count moves; a delete removes the row from under the
   * person's hand, and a count that lagged behind an empty space is the
   * surface looking broken for the length of a round trip.
   */
  onCountChange?: (delta: number) => void
}

export function useComments({
  reelId,
  viewerId,
  canWrite,
  onCountChange,
}: UseCommentsOptions): CommentsThread {
  const [rows, setRows] = useState<CommentRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<CommentsStatus>("idle")
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState("")
  const [liked, setLiked] = useState<Map<string, boolean>>(new Map())
  const [likeCounts, setLikeCounts] = useState<Map<string, number>>(new Map())

  const inFlight = useRef(false)
  /** Local, monotonic, never seen by anyone: the pending row's key. */
  const nonce = useRef(0)
  /**
   * The short the in-flight page belongs to.
   *
   * A ref and not a closure capture, because the response has to be checked
   * against the CURRENT short rather than the one that was current when the
   * request left. Swiping faster than the network is the normal case here.
   */
  const loadingFor = useRef<string | null>(null)

  const say = useCallback((err: unknown) => {
    const { status: httpStatus, code } = failureOf(err)
    return commentErrorMessage(code, httpStatus)
  }, [])

  const load = useCallback(
    async (next: string | null, mode: "replace" | "append") => {
      if (!reelId || inFlight.current) return
      inFlight.current = true
      loadingFor.current = reelId
      if (mode === "replace") setStatus("loading")
      else setLoadingMore(true)
      setError("")

      try {
        const page = await fetchComments(reelId, next)
        // The short changed while this was in the air. Nothing to merge into.
        if (loadingFor.current !== reelId) return
        setRows((prev) => (mode === "replace" ? page.items : mergeComments(prev, page.items)))
        setCursor(page.nextCursor)
        setStatus("ready")
      } catch (err) {
        if (loadingFor.current !== reelId) return
        // A failed FIRST page has nothing to show, so it is the whole state; a
        // failed later page keeps the comments already on screen and says so
        // underneath them.
        if (mode === "replace") setStatus("error")
        setError(say(err))
      } finally {
        inFlight.current = false
        setLoadingMore(false)
      }
    },
    [reelId, say]
  )

  /* ── The short changed ────────────────────────────────────────────────── */

  useEffect(() => {
    setRows([])
    setCursor(null)
    setStatus("idle")
    setError("")
    setLiked(new Map())
    setLikeCounts(new Map())
    inFlight.current = false
    loadingFor.current = null
    if (reelId) void load(null, "replace")
    // `load` is recreated whenever `reelId` changes and depends on nothing
    // else that should restart a thread, so `reelId` is the honest trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelId])

  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return
    void load(cursor, "append")
  }, [cursor, load, loadingMore])

  const retry = useCallback(() => {
    void load(cursor, cursor ? "append" : "replace")
  }, [cursor, load])

  /* ── Writing ─────────────────────────────────────────────────────────── */

  const post = useCallback(
    async (text: string): Promise<boolean> => {
      if (!reelId || !canWrite || !viewerId) return false
      nonce.current += 1
      const pending = pendingComment({
        postId: reelId,
        authorId: viewerId,
        text,
        nonce: String(nonce.current),
        createdAt: new Date().toISOString(),
      })
      setRows((prev) => [pending, ...prev])
      setError("")
      try {
        const saved = await createComment(reelId, text)
        setRows((prev) => settleComment(prev, pending.id, saved))
        onCountChange?.(countDelta("created"))
        return true
      } catch (err) {
        // The row goes back off the list AND the reason is said. A rollback
        // nobody is told about is worse than no optimism at all.
        setRows((prev) => discardComment(prev, pending.id))
        setError(say(err))
        return false
      }
    },
    [canWrite, onCountChange, reelId, say, viewerId]
  )

  const reply = useCallback(
    async (commentId: string, text: string): Promise<boolean> => {
      if (!canWrite) return false
      setError("")
      try {
        const saved = await replyToComment(commentId, text)
        setRows((prev) => replaceComment(prev, commentId, (row) => ({ ...row, reply: saved })))
        onCountChange?.(countDelta("created"))
        return true
      } catch (err) {
        // Not optimistic, unlike a top-level comment, and deliberately so: the
        // three refusals a reply can meet — REPLY_OWNER_ONLY, REPLY_EXISTS,
        // CANNOT_REPLY_TO_REPLY — are all "this was never allowed", and a
        // creator watching their own reply appear and then vanish would
        // reasonably read it as the platform deleting it.
        setError(say(err))
        return false
      }
    },
    [canWrite, onCountChange, say]
  )

  const edit = useCallback(
    async (commentId: string, text: string): Promise<boolean> => {
      if (!canWrite) return false
      setError("")
      try {
        const saved = await editComment(commentId, text)
        setRows((prev) => replaceComment(prev, commentId, () => saved))
        return true
      } catch (err) {
        setError(say(err))
        return false
      }
    },
    [canWrite, say]
  )

  const remove = useCallback(
    async (commentId: string): Promise<boolean> => {
      if (!canWrite) return false
      const doomed =
        rows.find((row) => row.id === commentId) ??
        rows.map((row) => row.reply).find((row) => row?.id === commentId)
      setRows((prev) => removeComment(prev, commentId))
      onCountChange?.(countDelta("deleted", doomed))
      setError("")
      try {
        await deleteComment(commentId)
        return true
      } catch (err) {
        // Put it back. A comment that disappears and stays disappeared while
        // the server still has it is the worst of the three outcomes.
        if (doomed) setRows((prev) => mergeComments(prev, [doomed]))
        onCountChange?.(-countDelta("deleted", doomed))
        setError(say(err))
        return false
      }
    },
    [canWrite, onCountChange, rows, say]
  )

  /**
   * The heart on a comment.
   *
   * A TOGGLE on the server — one method, no desired state to send — so the
   * optimistic flip is a guess at which way it went, and the server's own
   * `liked` replaces it. See ./comments.ts for why the initial state is always
   * "not liked": the list carries no viewer flag, and this surface does not
   * pretend to know something it was not told.
   */
  const toggleLike = useCallback(
    (commentId: string) => {
      if (!canWrite) return
      const before = liked.get(commentId) === true
      setLiked((prev) => new Map(prev).set(commentId, !before))
      likeComment(commentId)
        .then((result) => {
          setLiked((prev) => new Map(prev).set(commentId, result.on))
          if (result.count !== null) {
            setLikeCounts((prev) => new Map(prev).set(commentId, result.count as number))
          }
        })
        .catch(() => {
          setLiked((prev) => new Map(prev).set(commentId, before))
        })
    },
    [canWrite, liked]
  )

  const likeCountOf = useCallback(
    (row: CommentRow) => commentLikeCount(row, liked.get(row.id), likeCounts.get(row.id)),
    [liked, likeCounts]
  )

  return {
    rows,
    status,
    loadingMore,
    hasMore: Boolean(cursor),
    error,
    liked,
    likeCountOf,
    loadMore,
    retry,
    post,
    reply,
    edit,
    remove,
    toggleLike,
  }
}
