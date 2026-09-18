"use client"

/**
 * The comment thread's state, and every write it can make.
 *
 * The rules are in ./thread.ts and the requests are in ./api.ts; this is what
 * holds them together — one hook, so the surface below it is a rendering of a
 * value rather than eight components each fetching something.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OPTIMISTIC, WITH A ROLLBACK NOBODY HAS TO GUESS AT
 *
 * A comment appears the moment it is written, a like moves the moment it is
 * pressed, an edit takes effect the moment it is saved. Every one of them puts
 * the state BACK and says why when the server refuses — which is the idiom
 * `useOptimisticToggle` in @momentum/interactions already applies to the action
 * bar, and the reason it is worth repeating: a rollback nobody is told about is
 * worse than no optimism at all, because the person is left believing something
 * that is not true.
 *
 * The pending row is @momentum/content's `pendingComment`, so it is a
 * `CommentRow` everywhere else — keyed, rendered and merged by the same code as
 * a real one — and `isPendingComment` is what stops it becoming the target of
 * an edit, a delete, a like or a report before it has an id.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE DEEP LINK OPENS A WINDOW, AND THE WINDOW HAS NO CURSOR
 *
 * `?focusComment={id}` comes from a notification. `GET …/comments/around/{id}`
 * answers a window around that comment and **no `next_cursor`** — the handler
 * passes `nil` meta — so there is nothing to page from. Rather than invent a
 * cursor out of the oldest row's timestamp, which would silently skip every
 * comment written between the window and the top of the list, the hook keeps
 * the window as what it is: an opening view, with a control that leaves it and
 * loads the thread from the top. That is a limitation of the endpoint stated
 * on screen rather than papered over.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE COUNT
 *
 * It starts at the post's own `counts.comments` — the number the action bar
 * above is already showing — and moves by this thread's writes. It is never
 * "how many rows are loaded": twenty of four hundred would otherwise be
 * reported as four hundred becoming twenty the moment the thread opened.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  commentErrorMessage,
  discardComment,
  mergeComments,
  pendingComment,
  settleComment,
  type CommentRow,
  type ReportReason,
} from "@momentum/content"
import {
  commentsAround,
  createComment,
  deleteComment as deleteCommentRequest,
  editComment as editCommentRequest,
  errorCode,
  likeComment,
  listComments,
  replyToComment,
  reportComment,
  status,
} from "./api"
import {
  applyLike,
  attachReply,
  commentCount,
  nudgeLike,
  removeComment,
  replaceBody,
} from "./thread"

export interface UseCommentsInput {
  postId: string
  /** The viewer, or null. Signed out reads the thread and writes nothing. */
  viewerId: string | null
  /** The post's own comment count, from the feed row. */
  baseCount: number
  /** The author's switch. `true` means there is no thread at all. */
  disabled: boolean
  /** From `?focusComment=` — see ./thread.ts's `focusCommentId`. */
  focusId: string | null
}

export interface CommentsState {
  rows: CommentRow[]
  loading: boolean
  loadingMore: boolean
  /** The first page failed. The thread shows this with a retry. */
  error: string | null
  /** A write failed. Shown near the composer and cleared on the next attempt. */
  writeError: string | null
  ended: boolean
  count: number
  /** True while the thread is showing the window around a linked comment. */
  focused: boolean
  /** Which ids this viewer has liked in THIS session. See ./thread.ts. */
  liked: ReadonlySet<string>
  /** Which ids this viewer has reported in this session, so the row can say so. */
  reported: ReadonlySet<string>

  retry: () => void
  loadMore: () => void
  /** Leave the deep-linked window and read the thread from the top. */
  showAll: () => void
  post: (text: string) => Promise<boolean>
  reply: (commentId: string, text: string) => Promise<boolean>
  toggleLike: (commentId: string) => void
  edit: (commentId: string, body: string) => Promise<boolean>
  remove: (commentId: string) => Promise<boolean>
  report: (commentId: string, reason: ReportReason, details: string) => Promise<boolean>
  dismissWriteError: () => void
}

/** A key that survives a retry. See the header of ./api.ts. */
function nonce(): string {
  try {
    return crypto.randomUUID()
  } catch {
    // A browser without `crypto.randomUUID` (or an insecure context) still
    // needs a key that is unique per composed comment. Uniqueness is all that
    // is asked of it; it is never a secret and never persisted.
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }
}

/** The message for a refusal, from the service's own code where there is one. */
function refusal(error: unknown): string {
  return commentErrorMessage(errorCode(error), status(error))
}

export function useComments(input: UseCommentsInput): CommentsState {
  const { postId, viewerId, baseCount, disabled, focusId } = input

  const [rows, setRows] = useState<CommentRow[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [ended, setEnded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [writeError, setWriteError] = useState<string | null>(null)
  const [delta, setDelta] = useState(0)
  const [liked, setLiked] = useState<ReadonlySet<string>>(() => new Set())
  const [reported, setReported] = useState<ReadonlySet<string>>(() => new Set())

  /**
   * Which comment the thread is opened ON, if any.
   *
   * State rather than the prop, because `showAll` clears it and the URL does
   * not change — rewriting the address bar would put a history entry between
   * somebody and the Back button they pressed to get out of a video.
   */
  const [focus, setFocus] = useState<string | null>(focusId)
  useEffect(() => setFocus(focusId), [focusId])

  /**
   * Guards a second concurrent page fetch.
   *
   * A ref and not state: `loadMore` is handed to a scroll sentinel and to a
   * button, and two presses a frame apart would both read a `loadingMore` that
   * React has not committed yet.
   */
  const inFlight = useRef(false)

  /**
   * The list as it is RIGHT NOW, for the two writes that roll back to it.
   *
   * `edit` and `remove` have to keep a snapshot to restore on a refusal, and
   * closing over `rows` would capture the list as it was when the handler was
   * built — so a rollback could reinstate a row that has since been deleted, or
   * drop a comment somebody wrote while the request was in the air. A ref is
   * always the committed list and keeps both handlers stable, which matters
   * because they are passed down to every row.
   */
  const rowsRef = useRef<CommentRow[]>(rows)
  rowsRef.current = rows

  /** Reset everything when the video changes. */
  useEffect(() => {
    setRows([])
    setCursor(null)
    setEnded(false)
    setError(null)
    setWriteError(null)
    setDelta(0)
    setLiked(new Set())
    setReported(new Set())
  }, [postId])

  /* ── Reading ──────────────────────────────────────────────────────────── */

  const loadFirst = useCallback(async () => {
    if (disabled) return
    inFlight.current = true
    setLoading(true)
    setError(null)
    try {
      if (focus) {
        const window = await commentsAround(postId, focus)
        if (window) {
          setRows(window)
          // No cursor comes back with a window; `showAll` is the way onward.
          setCursor(null)
          setEnded(true)
          return
        }
        // The linked comment is gone — a deleted comment, or a stale
        // notification. Fall through to the ordinary thread rather than
        // showing an error for something nobody did wrong.
        setFocus(null)
      }
      const page = await listComments(postId, null)
      setRows(page.items)
      setCursor(page.nextCursor)
      setEnded(!page.nextCursor)
    } catch (err) {
      setError(refusal(err))
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }, [disabled, focus, postId])

  useEffect(() => {
    void loadFirst()
  }, [loadFirst])

  const loadMore = useCallback(() => {
    if (inFlight.current || ended || !cursor || disabled) return
    inFlight.current = true
    setLoadingMore(true)
    listComments(postId, cursor)
      .then((page) => {
        // `mergeComments` and not a concatenation: the cursor is a timestamp,
        // so a comment written between two page fetches can arrive twice, and
        // a duplicate React key is a silent rendering corruption.
        setRows((prev) => mergeComments(prev, page.items))
        setCursor(page.nextCursor)
        setEnded(!page.nextCursor)
      })
      .catch((err) => setWriteError(refusal(err)))
      .finally(() => {
        inFlight.current = false
        setLoadingMore(false)
      })
  }, [cursor, disabled, ended, postId])

  const showAll = useCallback(() => {
    setFocus(null)
    setRows([])
    setCursor(null)
    setEnded(false)
  }, [])

  /* ── Writing ──────────────────────────────────────────────────────────── */

  const post = useCallback(
    async (text: string): Promise<boolean> => {
      if (!viewerId) return false
      const key = nonce()
      const optimistic = pendingComment({
        postId,
        authorId: viewerId,
        text,
        nonce: key,
        createdAt: new Date().toISOString(),
      })
      setWriteError(null)
      setRows((prev) => [optimistic, ...prev])
      setDelta((d) => d + 1)
      try {
        const saved = await createComment(postId, text, key)
        setRows((prev) => settleComment(prev, optimistic.id, saved))
        return true
      } catch (err) {
        setRows((prev) => discardComment(prev, optimistic.id))
        setDelta((d) => d - 1)
        setWriteError(refusal(err))
        return false
      }
    },
    [postId, viewerId]
  )

  const reply = useCallback(
    async (commentId: string, text: string): Promise<boolean> => {
      if (!viewerId) return false
      setWriteError(null)
      try {
        const saved = await replyToComment(commentId, text, nonce())
        setRows((prev) => attachReply(prev, commentId, saved))
        setDelta((d) => d + 1)
        return true
      } catch (err) {
        // Not optimistic, and deliberately: a reply lands INSIDE another
        // comment, so an optimistic one that is then refused makes the
        // creator's answer appear under somebody's comment and vanish. The
        // round trip is one request and the control says it is saving.
        setWriteError(refusal(err))
        return false
      }
    },
    [viewerId]
  )

  const toggleLike = useCallback(
    (commentId: string) => {
      if (!viewerId) return
      const on = liked.has(commentId)
      setLiked((prev) => {
        const next = new Set(prev)
        if (on) next.delete(commentId)
        else next.add(commentId)
        return next
      })
      setRows((prev) => nudgeLike(prev, commentId, on ? -1 : 1))

      likeComment(commentId)
        .then((result) => {
          // The server's own number replaces ours: other people have been
          // liking this too, so theirs wins rather than being reconciled.
          setRows((prev) => applyLike(prev, commentId, result.count))
          setLiked((prev) => {
            const next = new Set(prev)
            if (result.liked) next.add(commentId)
            else next.delete(commentId)
            return next
          })
        })
        .catch((err) => {
          setLiked((prev) => {
            const next = new Set(prev)
            if (on) next.add(commentId)
            else next.delete(commentId)
            return next
          })
          setRows((prev) => nudgeLike(prev, commentId, on ? 1 : -1))
          setWriteError(refusal(err))
        })
    },
    [liked, viewerId]
  )

  const edit = useCallback(
    async (commentId: string, body: string): Promise<boolean> => {
      const before = rowsRef.current
      setWriteError(null)
      setRows((prev) => replaceBody(prev, commentId, body))
      try {
        await editCommentRequest(commentId, body)
        return true
      } catch (err) {
        // The whole list back, not a reverse-patch: `replaceBody` also stamped
        // `updated_at`, and undoing two fields by hand is how a row ends up
        // labelled "edited" with its original text.
        setRows(before)
        setWriteError(refusal(err))
        return false
      }
    },
    []
  )

  const remove = useCallback(
    async (commentId: string): Promise<boolean> => {
      const before = rowsRef.current
      setWriteError(null)
      setRows((prev) => removeComment(prev, commentId))
      setDelta((d) => d - 1)
      try {
        await deleteCommentRequest(commentId)
        return true
      } catch (err) {
        setRows(before)
        setDelta((d) => d + 1)
        setWriteError(refusal(err))
        return false
      }
    },
    []
  )

  const report = useCallback(
    async (commentId: string, reason: ReportReason, details: string): Promise<boolean> => {
      const filed = await reportComment(commentId, reason, details)
      if (filed) {
        setReported((prev) => new Set(prev).add(commentId))
      } else {
        setWriteError("That report could not be filed. Try again in a moment.")
      }
      return filed
    },
    []
  )

  const dismissWriteError = useCallback(() => setWriteError(null), [])

  /**
   * The count, and the one adjustment it needs.
   *
   * A pending row is already on the list and has already moved `delta`, so it
   * must not be counted twice — but it is also not yet a comment the server
   * knows about. `delta` is the truth and the rows are the display; nothing is
   * derived from `rows.length`.
   */
  const count = useMemo(() => commentCount(baseCount, delta), [baseCount, delta])

  return {
    rows,
    loading,
    loadingMore,
    error,
    writeError,
    ended,
    count,
    focused: focus !== null && rows.length > 0,
    liked,
    reported,
    retry: () => void loadFirst(),
    loadMore,
    showAll,
    post,
    reply,
    toggleLike,
    edit,
    remove,
    report,
    dismissWriteError,
  }
}
