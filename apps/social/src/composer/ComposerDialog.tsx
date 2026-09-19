"use client"

/**
 * The composer — the thing the "Create Post" button had nothing behind.
 *
 * ── What it is, and deliberately what it is not ───────────────────────────
 * Text, photos OR one video, and the audience. That is the whole of the first
 * version. post-service's create route accepts upwards of forty fields — polls,
 * feelings, locations, tagged people, scheduling, licences, comment moderation
 * — and every one of them is a control to design, explain and maintain. The
 * four things above are what a post IS; the rest are what a post can also have,
 * and they can arrive one at a time on top of something that works.
 *
 * ── The four things a dialog has to get right ─────────────────────────────
 * The same four ./LeftRail's drawer lists, because they are the four:
 *   · UNMOUNTED when closed. Out of the accessibility tree, out of the focus
 *     order, out of find-in-page — and, the part `hidden` cannot give, out of
 *     the DOM, so the object URLs and the file inputs go with it.
 *   · FOCUS GOES IN. On open, to the text box: the thing you came to use.
 *   · FOCUS STAYS IN. Tab off either end wraps.
 *   · FOCUS COMES BACK. On close, to whatever opened it. Hung off the
 *     UNMOUNT rather than off each of the four ways out, which is the one
 *     version with nothing to forget and no timer in it — React runs the
 *     cleanup during the commit that removes the node, so by the time
 *     `focus()` is called there is nothing left to be blurred out of.
 *
 * ── Escape asks, when there is something to lose ──────────────────────────
 * An Escape that silently discards a paragraph somebody has just written is
 * the worst thing a composer can do, and an Escape that ALWAYS asks is a
 * dialog that argues with you for closing an empty box. So it asks exactly
 * when `hasUnsavedWork` says there is work — and the confirmation is a state
 * of this dialog rather than `window.confirm`, which cannot be styled, cannot
 * be focus-managed and is blocked outright in some embedded browsers.
 *
 * ── The optimistic post, and the rollback ─────────────────────────────────
 * On Post: the uploads run first (they are the slow part and they are the part
 * that can fail in a way the person can act on), then the row goes into the
 * top of the feed and the create request goes out. The server's answer
 * replaces the row; a refusal takes it back out and the dialog stays open with
 * the draft intact and the reason on screen. ./published.ts carries the
 * mechanism and why it is not a context.
 *
 * Nothing is optimistic about the UPLOAD half. A file that has not reached
 * storage is not a post, and showing one in the feed while its bytes are still
 * going up would mean withdrawing it minutes later.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { Image as ImageIcon, Loader2, Video as VideoIcon, X } from "lucide-react"
import { SOLID_ACTION_FILL } from "@momentum/chrome"
import { Avatar } from "@momentum/content"
import {
  ACCEPTED_IMAGE_TYPES,
  ACCEPTED_VIDEO_TYPES,
  IMAGE_ACCEPT_ATTR,
  MAX_ATTACHMENTS,
  MAX_SINGLE_PUT_BYTES,
  MAX_TEXT_RUNES,
  VIDEO_ACCEPT_ATTR,
  createPost,
  failureOf,
  uploadOne,
  type Visibility,
} from "./api"
import {
  EMPTY_DRAFT,
  VISIBILITY_OPTIONS,
  classifyFile,
  createFailureMessage,
  draftProblem,
  hasUnsavedWork,
  postTypeOf,
  textLength,
  uploadFailureMessage,
  type Draft,
  type DraftAttachment,
} from "./draft"
import { UploadTransportError } from "./upload"
import { confirmedItem, optimisticItem, publish, tempPostId } from "./published"

/** Everything a person can put focus on, in the order Tab would reach it. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",")

export interface ComposerDialogProps {
  open: boolean
  onClose: () => void
  /** The trigger, so focus can go back to it. See the header. */
  returnFocusTo?: React.RefObject<HTMLElement | null>
  /** The signed-in account, for the optimistic row's byline. */
  viewer: { id: string; displayName?: string; avatarUrl?: string }
}

export function ComposerDialog(props: ComposerDialogProps) {
  // A separate component so that CLOSING is an UNMOUNT, which is what makes
  // the focus restore exact and what disposes of the object URLs. Rendering
  // null from inside one component would leave its hooks mounted and there
  // would be no unmount to hang either on.
  return props.open ? <ComposerPanel {...props} /> : null
}

type Phase = "editing" | "uploading" | "posting"

function ComposerPanel({ onClose, returnFocusTo, viewer }: ComposerDialogProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [phase, setPhase] = useState<Phase>("editing")
  const [error, setError] = useState<string | null>(null)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  const panelRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const titleId = useId()
  const errorId = useId()
  const counterId = useId()

  /**
   * ONE idempotency key per attempt, minted when the draft changes.
   *
   * This is the whole reason the header is worth sending. A Post that timed
   * out and is pressed again lands on the SAME key and cannot produce two
   * posts — the server replays the first. But post-service binds the key to a
   * fingerprint of the whole canonical request, so a retry whose text changed
   * is a 409 IDEMPOTENCY_KEY_REUSED rather than a silent replay of the old
   * words. Both halves are what this ref implements: the key survives a retry
   * of the same draft, and is thrown away the moment the draft is edited.
   */
  const keyRef = useRef<string | null>(null)
  const mintKey = useCallback(() => {
    if (!keyRef.current) {
      keyRef.current = globalThis.crypto?.randomUUID?.() ?? fallbackUuid()
    }
    return keyRef.current
  }, [])
  const forgetKey = useCallback(() => {
    keyRef.current = null
  }, [])

  /* ── Focus in on mount, and back to the trigger on unmount ─────────────── */
  useEffect(() => {
    textRef.current?.focus()
    const trigger = returnFocusTo
    return () => {
      trigger?.current?.focus()
    }
  }, [returnFocusTo])

  /**
   * The page behind a modal does not scroll.
   *
   * Without this, a phone scrolls the FEED under the dialog when the finger
   * leaves the text box — the dialog stays put and the world moves behind it,
   * which reads as the page having broken. Restored on unmount to whatever it
   * was, rather than to "", so a zone that sets its own overflow keeps it.
   */
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  /**
   * Every object URL this dialog made, revoked when it unmounts.
   *
   * A preview is `URL.createObjectURL(file)` and the browser holds the whole
   * file in memory until it is revoked. Ten photographs is tens of megabytes
   * that never come back for the life of the tab. The set is a ref rather than
   * derived from `draft.attachments`, because an attachment removed during
   * editing is gone from the draft and its URL still needs revoking.
   */
  const urls = useRef(new Set<string>()).current
  useEffect(() => {
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [urls])

  const busy = phase !== "editing"

  /* ── Closing ──────────────────────────────────────────────────────────── */

  const requestClose = useCallback(() => {
    // Never mid-flight. A dialog that vanishes while its post is in the air
    // leaves the person with no idea whether it went.
    if (busy) return
    if (hasUnsavedWork(draft)) {
      setConfirmingClose(true)
      return
    }
    onClose()
  }, [busy, draft, onClose])

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        // Escape while the confirmation is up answers the confirmation —
        // "no, do not close" — rather than closing past it, which would make
        // the second Escape do the thing the first one asked about.
        if (confirmingClose) {
          setConfirmingClose(false)
          return
        }
        requestClose()
        return
      }
      if (event.key !== "Tab") return
      const items = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE)
      if (!items || items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      // Only the two ends need handling. Everything between them is the
      // browser's own order, which is the order the markup already reads in.
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
    },
    [confirmingClose, requestClose]
  )

  /* ── Editing ──────────────────────────────────────────────────────────── */

  const setText = useCallback(
    (text: string) => {
      forgetKey()
      setError(null)
      setDraft((prev) => ({ ...prev, text }))
    },
    [forgetKey]
  )

  const setVisibility = useCallback(
    (visibility: Visibility) => {
      forgetKey()
      setDraft((prev) => ({ ...prev, visibility }))
    },
    [forgetKey]
  )

  /**
   * Files chosen, checked before anything is uploaded.
   *
   * Every refusal here is one the server would also make — except the size
   * ceiling, which is this client refusing to START an upload it knows it
   * cannot finish. `MAX_SINGLE_PUT_BYTES` carries that argument: the signed URL
   * lives fifteen minutes, and a file that needs longer than that fails at the
   * end of a long wait rather than at the beginning of none.
   */
  const addFiles = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return
      forgetKey()
      setError(null)

      const added: DraftAttachment[] = []
      let problem: string | null = null

      for (const file of Array.from(files)) {
        if (file.size > MAX_SINGLE_PUT_BYTES) {
          problem = `${file.name} is too large to post from the web. The limit is 500 MB.`
          continue
        }
        const verdict = classifyFile(file, {
          image: ACCEPTED_IMAGE_TYPES,
          video: ACCEPTED_VIDEO_TYPES,
        })
        if ("problem" in verdict) {
          problem = verdict.problem
          continue
        }
        const previewUrl = URL.createObjectURL(file)
        urls.add(previewUrl)
        added.push({
          key: `${file.name}:${file.size}:${file.lastModified}:${added.length}`,
          file,
          kind: verdict.kind,
          previewUrl,
        })
      }

      if (added.length > 0) {
        setDraft((prev) => ({
          ...prev,
          attachments: [...prev.attachments, ...added].slice(0, MAX_ATTACHMENTS),
        }))
      }
      if (problem) setError(problem)
    },
    [forgetKey, urls]
  )

  const removeAttachment = useCallback(
    (key: string) => {
      forgetKey()
      setError(null)
      setDraft((prev) => {
        const going = prev.attachments.find((a) => a.key === key)
        if (going) {
          // Revoked here as well as on unmount: a person who adds and removes
          // ten videos in one sitting should not be holding all ten.
          URL.revokeObjectURL(going.previewUrl)
          urls.delete(going.previewUrl)
        }
        return { ...prev, attachments: prev.attachments.filter((a) => a.key !== key) }
      })
    },
    [forgetKey, urls]
  )

  /* ── Posting ──────────────────────────────────────────────────────────── */

  const problem = draftProblem(draft)
  const length = textLength(draft.text)

  const submit = useCallback(async () => {
    if (busy) return
    const stop = draftProblem(draft)
    if (stop) {
      setError(stop)
      return
    }
    setError(null)

    /* 1. The bytes. Nothing is optimistic until every one of them has landed. */
    let mediaIds: string[] = []
    if (draft.attachments.length > 0) {
      setPhase("uploading")
      setProgress({ done: 0, total: draft.attachments.length })
      try {
        // Sequential, not parallel. Ten concurrent multi-megabyte PUTs from a
        // phone share one uplink and all ten crawl; the progress count is also
        // only honest when one finishes at a time.
        for (const attachment of draft.attachments) {
          const id = await uploadOne(attachment.file, attachment.kind)
          mediaIds = [...mediaIds, id]
          setProgress({ done: mediaIds.length, total: draft.attachments.length })
        }
      } catch (err: unknown) {
        setPhase("editing")
        setProgress(null)
        setError(
          err instanceof UploadTransportError
            ? uploadFailureMessage(err.status)
            : uploadFailureMessage(null)
        )
        return
      }
    }

    /* 2. The optimistic row, and the create. */
    setPhase("posting")
    const tempId = tempPostId()
    const optimistic = optimisticItem({
      id: tempId,
      authorId: viewer.id,
      text: draft.text,
      visibility: draft.visibility,
      hasMedia: mediaIds.length > 0,
      author: {
        id: viewer.id,
        ...(viewer.displayName ? { display_name: viewer.displayName } : {}),
      },
    })
    publish({ kind: "optimistic", item: optimistic })

    try {
      const post = await createPost(
        {
          content_type: "post",
          post_type: postTypeOf(draft),
          visibility: draft.visibility,
          text: draft.text,
          media_ids: mediaIds,
          app_origin: "web",
        },
        mintKey()
      )
      publish({ kind: "confirmed", tempId, item: confirmedItem(post, optimistic) })
      // Only now: the draft is gone, the key is spent, and the dialog closes
      // onto a feed whose first row is what was just written.
      forgetKey()
      setDraft(EMPTY_DRAFT)
      setProgress(null)
      setPhase("editing")
      onClose()
    } catch (err: unknown) {
      // Take the row back out, keep the draft, say why. A post that vanished
      // from the feed with no explanation reads as a bug rather than as
      // something that did not land.
      publish({ kind: "withdrawn", tempId })
      setPhase("editing")
      setProgress(null)
      setError(createFailureMessage(failureOf(err)))
    }
  }, [busy, draft, viewer, mintKey, forgetKey, onClose])

  /* ── Render ───────────────────────────────────────────────────────────── */

  const canPost = !busy && problem === null

  return (
    <>
      {/* The backdrop is a real <button> and not a <div> with an onClick: a
          div that dismisses things is invisible to everything except a mouse,
          and a control with no accessible name is one a screen reader reads as
          nothing at all. `tabIndex={-1}` because the KEYBOARD way out is
          Escape and the close button — a third tab stop also called "Close",
          before the dialog's own, is one job announced twice. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close the composer"
        onClick={requestClose}
        className="fixed inset-0 z-50 cursor-default bg-mo-scrim/70"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        // Bottom sheet on a phone, centred card from `sm:` — the shape a
        // composer takes on each. `max-h` with an inner scroll so a long draft
        // and ten previews cannot push the Post button off the screen, which
        // is the classic way a dialog becomes unusable at 360×640.
        className="fixed inset-x-0 bottom-0 top-auto z-50 mx-auto flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-mo-lg border border-mo bg-mo-surface shadow-mo-lift sm:inset-0 sm:my-auto sm:h-fit sm:max-w-[600px] sm:rounded-mo-lg"
      >
        <header className="flex shrink-0 items-center gap-3 border-b border-mo px-4 py-3">
          <h2
            id={titleId}
            className="min-w-0 flex-1 truncate font-mo-display text-lg font-semibold tracking-mo-display text-mo-ink"
          >
            Create Post
          </h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            aria-label="Close the composer"
            className="-mr-2 grid h-11 w-11 shrink-0 cursor-default place-items-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
          >
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="flex gap-3">
            <Avatar name={viewer.displayName} id={viewer.id} src={viewer.avatarUrl} />
            <div className="min-w-0 flex-1">
              <label htmlFor={`${titleId}-text`} className="sr-only">
                What is happening?
              </label>
              <textarea
                ref={textRef}
                id={`${titleId}-text`}
                value={draft.text}
                onChange={(e) => setText(e.target.value)}
                disabled={busy}
                rows={4}
                // The counter and the error are both described, not just
                // shown: a limit somebody can see and a screen reader cannot
                // is a limit that is enforced twice and explained once.
                aria-describedby={`${counterId}${error ? ` ${errorId}` : ""}`}
                placeholder="What is happening?"
                className="w-full resize-y bg-transparent text-base leading-relaxed text-mo-ink outline-none placeholder:text-mo-body disabled:opacity-60"
              />
            </div>
          </div>

          {draft.attachments.length > 0 && (
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {draft.attachments.map((attachment) => (
                <li
                  key={attachment.key}
                  className="relative overflow-hidden rounded-mo border border-mo bg-mo-raised"
                >
                  {attachment.kind === "image" ? (
                    /* A `blob:` URL for a file that is not on any server yet.
                       next/image cannot optimise one — it has no loader for
                       an object URL and would refuse the host — and there is
                       nothing to optimise: the bytes are already in memory,
                       on this machine, and the element is 200px wide. */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={attachment.previewUrl}
                      alt={`Attachment: ${attachment.file.name}`}
                      className="aspect-square w-full object-cover"
                    />
                  ) : (
                    <video
                      src={attachment.previewUrl}
                      // No autoplay and no sound: it is a thumbnail of a file,
                      // not a player, and a grid of previews that all start
                      // playing is the composer making noise.
                      muted
                      playsInline
                      preload="metadata"
                      aria-label={`Attachment: ${attachment.file.name}`}
                      className="aspect-square w-full bg-mo-sunken object-cover"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.key)}
                    disabled={busy}
                    aria-label={`Remove ${attachment.file.name}`}
                    // On the scrim, not on the page: this sits over arbitrary
                    // photography and --mo-ink flips with the scope while a
                    // photograph does not. --mo-on-scrim on scrim @ .70 is
                    // 6.86 over pure white, the worst ground a veil can have.
                    className="absolute right-1.5 top-1.5 grid h-8 w-8 cursor-default place-items-center rounded-mo-pill bg-mo-scrim/70 text-mo-on-scrim backdrop-blur-sm transition-opacity duration-150 ease-mo hover:bg-mo-scrim/80 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
                  >
                    <X aria-hidden="true" className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* The audience. A real <select> rather than a custom menu: it is
              four options, the browser's own control is keyboard- and
              screen-reader-complete on every platform, and a phone gets its
              native picker. The hint under it is the chosen option's own
              sentence, which is what makes "Unlisted" mean something. */}
          <div className="mt-4 border-t border-mo pt-4">
            <label
              htmlFor={`${titleId}-visibility`}
              className="block text-xs font-semibold uppercase tracking-mo-eyebrow text-mo-body"
            >
              Who can see this
            </label>
            <select
              id={`${titleId}-visibility`}
              value={draft.visibility}
              onChange={(e) => setVisibility(e.target.value as Visibility)}
              disabled={busy}
              className="mt-2 min-h-[44px] w-full rounded-mo-pill border border-mo bg-mo-sunken px-4 text-sm font-semibold text-mo-ink outline-none transition-colors duration-150 ease-mo focus-visible:border-mo-focus focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo disabled:opacity-60"
            >
              {VISIBILITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-mo-body">
              {VISIBILITY_OPTIONS.find((o) => o.value === draft.visibility)?.hint}
            </p>
          </div>
        </div>

        <footer className="shrink-0 border-t border-mo px-4 py-3">
          {/* Always rendered, so a screen reader has a live region to announce
              INTO — a `role="alert"` that appears at the same moment as its
              text is a region the announcement can be missed by. */}
          <div role="alert" aria-live="assertive" className="empty:hidden">
            {error && (
              <p id={errorId} className="mb-3 text-sm text-mo-bad">
                {error}
              </p>
            )}
          </div>

          {confirmingClose ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-sm text-mo-ink">Discard this post?</p>
              <button
                type="button"
                onClick={() => setConfirmingClose(false)}
                className="min-h-[44px] cursor-default rounded-mo-pill border border-mo-strong px-4 text-sm font-semibold text-brand-accent transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
              >
                Keep writing
              </button>
              <button
                type="button"
                onClick={onClose}
                // --mo-bad, because this is the destructive half and the only
                // thing in this dialog that throws work away. It is not a
                // second BUTTON colour: it is the one place a refusal colour
                // belongs, exactly as "Try again" uses it elsewhere.
                className="min-h-[44px] cursor-default rounded-mo-pill border border-mo-bad px-4 text-sm font-semibold text-mo-bad transition-colors duration-150 ease-mo hover:bg-mo-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
              >
                Discard
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input
                ref={imageInputRef}
                type="file"
                accept={IMAGE_ACCEPT_ATTR}
                multiple
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files)
                  // Cleared so that choosing the SAME file twice in a row
                  // still fires `change` — the value is what the event is
                  // keyed on, and a re-pick of an identical path is silent
                  // otherwise.
                  e.target.value = ""
                }}
              />
              <input
                ref={videoInputRef}
                type="file"
                accept={VIDEO_ACCEPT_ATTR}
                className="sr-only"
                onChange={(e) => {
                  addFiles(e.target.files)
                  e.target.value = ""
                }}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                disabled={busy}
                aria-label="Add photos"
                title="Add photos"
                className="grid h-11 w-11 shrink-0 cursor-default place-items-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
              >
                <ImageIcon aria-hidden="true" className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={busy}
                aria-label="Add a video"
                title="Add a video"
                className="grid h-11 w-11 shrink-0 cursor-default place-items-center rounded-mo-pill text-mo-body transition-colors duration-150 ease-mo hover:bg-mo-raised hover:text-mo-ink disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo"
              >
                <VideoIcon aria-hidden="true" className="h-5 w-5" />
              </button>

              {/* The counter. `aria-live="polite"` only once it is close to
                  the limit: announcing a number on every keystroke is how a
                  screen reader is made unusable. --mo-bad over the limit,
                  because that is a refusal and not a warning. */}
              <p
                id={counterId}
                aria-live={length > MAX_TEXT_RUNES - 200 ? "polite" : "off"}
                className={[
                  "min-w-0 flex-1 truncate text-right text-xs tabular-nums",
                  length > MAX_TEXT_RUNES ? "text-mo-bad" : "text-mo-body",
                ].join(" ")}
              >
                {phase === "uploading" && progress
                  ? `Uploading ${progress.done + 1} of ${progress.total}…`
                  : length > MAX_TEXT_RUNES - 500
                    ? `${(MAX_TEXT_RUNES - length).toLocaleString()} left`
                    : ""}
              </p>

              <button
                type="button"
                onClick={() => void submit()}
                disabled={!canPost}
                // `aria-describedby` rather than a tooltip: the reason a
                // disabled Post is disabled is the error region's job, and a
                // control that is unavailable with no reason given is the
                // thing `aria-disabled` exists elsewhere in this codebase to
                // avoid. Here it is genuinely `disabled` — the press would do
                // nothing and there is a visible sentence saying what to fix.
                className={[
                  "inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-mo-pill px-5 text-sm font-semibold shadow-mo-sm transition-colors duration-150 ease-mo focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mo",
                  SOLID_ACTION_FILL,
                  canPost ? "" : "opacity-50",
                ].join(" ")}
              >
                {busy && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                {phase === "uploading" ? "Uploading…" : phase === "posting" ? "Posting…" : "Post"}
              </button>
            </div>
          )}
        </footer>
      </div>
    </>
  )
}

/**
 * A UUID where `crypto.randomUUID` is missing.
 *
 * It is missing in exactly one case that matters: a browser on an insecure
 * origin, because the whole of `crypto` is a secure-context API. The gateway
 * REQUIRES the `Idempotency-Key` to parse as a UUID and answers 400
 * INVALID_IDEMPOTENCY_KEY otherwise, so without a fallback the composer would
 * be unusable over plain http — which is what a LAN dev build is.
 *
 * `Math.random` is not a cryptographic source and does not need to be: the key
 * is scoped to one account's own create request and its only job is to be
 * unique among that person's attempts. It is a v4-SHAPED string, which is all
 * `uuid.Parse` checks.
 */
function fallbackUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === "x" ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}
