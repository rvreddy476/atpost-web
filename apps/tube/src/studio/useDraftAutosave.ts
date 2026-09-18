"use client"

/**
 * "Draft saved" — the quiet one.
 *
 * ── What is being saved, and what is not ──────────────────────────────────
 * ./draftPayload.ts holds the whole argument: the server's draft payload is a
 * closed set of keys, eleven of this studio's fields have no key in it, and
 * those eleven are kept in this browser instead of being smuggled through a
 * field named for something else. This hook is where the two halves are
 * written together and read back together.
 *
 * ── Why it is debounced and not throttled ─────────────────────────────────
 * The expensive thing is not the request, it is the round trip a PATCH makes
 * through the zone proxy while somebody is typing a description. A throttle
 * fires DURING the typing, which is when the value is least worth saving; a
 * trailing debounce fires in the pauses, which is exactly when it is worth
 * saving. Two seconds is long enough to sit inside ordinary typing and short
 * enough that closing the tab on a whim loses one sentence.
 *
 * ── It never blocks anything ──────────────────────────────────────────────
 * A save that fails says so and the studio carries on. The draft is a
 * convenience; the upload and the publish are the job, and a video that could
 * not be posted because a draft PATCH 500'd would be an appalling trade.
 *
 * ── The draft is deleted on a successful publish ──────────────────────────
 * By the studio, through `discard`. It is NOT published through
 * `/v1/posts/drafts/{id}/publish`, which would drop nine fields — see
 * ../tube/uploadApi.ts. So the draft never becomes a post, and an abandoned
 * one leaves no post behind: there is nothing on the server that turns one
 * into the other except a call this client does not make.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import {
  createPostDraft,
  deletePostDraft,
  failureOf,
  listPostDrafts,
  updatePostDraft,
  type PostDraftRow,
} from "@/tube/uploadApi"
import {
  DRAFT_POST_TYPE,
  fromDraftPayload,
  localDraftKey,
  mergeLocalHalf,
  toDraftPayload,
  toLocalHalf,
} from "./draftPayload"
import { parseLocalDateTime, type VideoDraft } from "./fields"

/** The pause the hook waits for before it writes. */
export const AUTOSAVE_DEBOUNCE_MS = 2_000

export type DraftSaveStatus = "idle" | "saving" | "saved" | "error"

export interface DraftAutosave {
  status: DraftSaveStatus
  /** The id, once one exists. Null before the first save. */
  draftId: string | null
  /** The sentence for a failed save. Null otherwise. */
  error: string | null
  /** An unfinished draft found on the server at mount, or null. */
  resumable: PostDraftRow | null
  /** Open that draft. Returns what the studio needs to rehydrate, or null. */
  resume: (row: PostDraftRow) => { draft: VideoDraft; mediaId: string | null; coverMediaId: string | null; complete: boolean } | null
  /** Stop offering the resumable draft without deleting it. */
  dismissResumable: () => void
  /** Delete the draft this session owns. Called after a successful publish. */
  discard: () => void
}

interface Params {
  draft: VideoDraft
  mediaId: string | null
  coverMediaId: string | null
  /** Off until there is a channel and a signed-in account. */
  enabled: boolean
}

export function useDraftAutosave({ draft, mediaId, coverMediaId, enabled }: Params): DraftAutosave {
  const [status, setStatus] = useState<DraftSaveStatus>("idle")
  const [draftId, setDraftId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [resumable, setResumable] = useState<PostDraftRow | null>(null)

  const idRef = useRef<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** The last body actually written, serialised. Guards the no-op PATCH. */
  const lastWritten = useRef<string>("")
  /** Bumped on discard so a save already in flight cannot resurrect the row. */
  const generation = useRef(0)

  /* ── Is there something to come back to? ────────────────────────────────── */

  useEffect(() => {
    if (!enabled) return
    let live = true
    listPostDrafts(20)
      .then((rows) => {
        if (!live) return
        // Only this studio's own drafts, and only ones still open. A `reel`
        // draft from the phone, or an article from the shell's composer, is
        // somebody else's work and offering to open it in a video studio
        // would be offering to overwrite it.
        const mine = rows.find((row) => {
          if (row.status && row.status !== "draft") return false
          if (row.post_type && row.post_type !== DRAFT_POST_TYPE) return false
          const payload = row.payload as Record<string, unknown> | undefined
          return payload?.content_type === "long_video"
        })
        setResumable(mine ?? null)
      })
      .catch(() => {
        // Nothing to say. The studio works without drafts, and an error
        // toast about a feature somebody has not used yet is noise.
      })
    return () => {
      live = false
    }
  }, [enabled])

  const resume = useCallback((row: PostDraftRow) => {
    const { draft: fromServer, mediaId: savedMedia, coverMediaId: savedCover } = fromDraftPayload(
      row.payload
    )

    let restored = fromServer
    let complete = false
    try {
      const raw = window.localStorage.getItem(localDraftKey(row.id))
      if (raw) {
        restored = mergeLocalHalf(restored, JSON.parse(raw))
        complete = true
      }
    } catch {
      // A private window, blocked site data, or a value that is not JSON.
      // The server half is still worth having, and `complete: false` is what
      // tells the studio to say which half came back.
    }

    // `schedule_at` lives beside the payload, not in it, and comes back as
    // RFC3339 UTC. The form's own field is a `datetime-local` in the
    // browser's zone, so it is converted rather than pasted: pasting the UTC
    // string into the input would show a time several hours from the one
    // somebody chose.
    if (row.schedule_at) {
      const at = new Date(row.schedule_at)
      if (!Number.isNaN(at.getTime())) {
        restored = {
          ...restored,
          scheduleMode: "at",
          scheduleAt: toLocalInputValue(at),
        }
      }
    }

    idRef.current = row.id
    setDraftId(row.id)
    setResumable(null)
    setStatus("saved")
    lastWritten.current = ""
    return { draft: restored, mediaId: savedMedia, coverMediaId: savedCover, complete }
  }, [])

  const dismissResumable = useCallback(() => setResumable(null), [])

  /* ── The save ──────────────────────────────────────────────────────────── */

  useEffect(() => {
    // Nothing to save until the asset exists: `validateDraft` on the server
    // refuses a payload with neither text nor media, and a draft that does
    // not name the media id is not protecting the expensive thing anyway.
    if (!enabled || !mediaId) return

    const payload = toDraftPayload(draft, mediaId, coverMediaId)
    const scheduleAt =
      draft.scheduleMode === "at" ? parseLocalDateTime(draft.scheduleAt) : null
    const body = {
      post_type: DRAFT_POST_TYPE,
      payload,
      schedule_at: scheduleAt === null ? null : new Date(scheduleAt).toISOString(),
    }
    const serialised = JSON.stringify(body)
    if (serialised === lastWritten.current) return

    if (timer.current) clearTimeout(timer.current)
    const mine = generation.current
    timer.current = setTimeout(() => {
      void (async () => {
        setStatus("saving")
        setError(null)
        try {
          const existing = idRef.current
          const row = existing
            ? await updatePostDraft(existing, body)
            : await createPostDraft(body)
          if (mine !== generation.current) {
            // `discard` ran while this was in flight. If it was a CREATE, the
            // row it just made is one `discard` never saw and would otherwise
            // sit in the person's drafts for ever, next to a video that is
            // already published. Tidy it here — best effort, because nothing
            // on screen depends on it.
            if (!existing) void deletePostDraft(row.id).catch(() => {})
            return
          }
          idRef.current = row.id
          setDraftId(row.id)
          lastWritten.current = serialised

          // The local half, under the id the server just gave us. Written
          // after the server half so the key never names a draft that does
          // not exist.
          try {
            window.localStorage.setItem(
              localDraftKey(row.id),
              JSON.stringify(toLocalHalf(draft))
            )
          } catch {
            // Storage full, or blocked. The server half is saved; the note
            // on the restore screen already covers a missing local half.
          }
          setStatus("saved")
        } catch (e) {
          if (mine !== generation.current) return
          setStatus("error")
          setError(draftFailureMessage(e))
        }
      })()
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [draft, mediaId, coverMediaId, enabled])

  const discard = useCallback(() => {
    const id = idRef.current
    generation.current += 1
    idRef.current = null
    setDraftId(null)
    setStatus("idle")
    lastWritten.current = ""
    if (timer.current) clearTimeout(timer.current)
    if (!id) return
    try {
      window.localStorage.removeItem(localDraftKey(id))
    } catch {
      /* see above */
    }
    // Best effort, and deliberately unawaited: this runs after a successful
    // publish, and a video that is live must not show an error because the
    // tidying up failed.
    void deletePostDraft(id).catch(() => {})
  }, [])

  return { status, draftId, error, resumable, resume, dismissResumable, discard }
}

/** A Date as a `datetime-local` value in the browser's own zone. */
export function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
}

/** Why a draft could not be saved, in a sentence. */
export function draftFailureMessage(error: unknown): string {
  const { status, code, message } = failureOf(error)
  if (code === "DRAFT_QUOTA") {
    return "You have 100 saved drafts, which is the most the server keeps. Delete one to save this."
  }
  if (code === "INVALID_DRAFT") {
    return message ?? "The server would not store this draft."
  }
  if (code === "DRAFT_NOT_EDITABLE") {
    return "This draft was already published or deleted somewhere else."
  }
  if (status === 401) return "Your session ended, so the draft was not saved."
  return "The draft could not be saved. Your work is still on this page."
}
