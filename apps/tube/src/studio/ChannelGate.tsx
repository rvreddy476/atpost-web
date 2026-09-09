"use client"

/**
 * The channel gate: what a creator with no channel sees instead of the studio.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THIS IS NOT AN EDGE CASE. IT IS THE FIRST SCREEN OF EVERY NEW CREATOR.
 *
 * `POST /v1/posts` with `content_type: "long_video"` and no channel is
 * **403 CHANNEL_REQUIRED**, and it fails closed — there is no fallback to
 * posting under a bare profile. `GET /v1/channels/me` is 404 `NO_CHANNEL`
 * for such an account. So somebody who has just signed up, picked a file,
 * waited out a transcode and typed a description would hit a 403 at the very
 * last click, with nothing recoverable on screen.
 *
 * The gate therefore runs BEFORE the picker, exactly as it does on the phone
 * (`ReelSurface.kt` shows the same form over the source step for
 * `PublishKind.LONG`), and the copy is the phone's:
 *
 *     "Create your channel"
 *     "Videos post under your channel. You can change this later."
 *
 * ── The field is `about`, and this is where that costs money ──────────────
 * `POST /v1/channels` binds `{name, handle, about, avatar_media_id}`. A body
 * carrying `description` is accepted — 201, a channel — and the text is
 * dropped. Somebody writes the paragraph explaining what their channel is
 * for, presses the button, gets a channel, and the paragraph is gone with no
 * way to tell that it happened.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { channelFailureMessage, checkHandleAvailable, createChannel } from "@/tube/uploadApi"
import type { CreatedChannel } from "@/tube/uploadApi"
import {
  CHANNEL_ABOUT_MAX,
  CHANNEL_HANDLE_MAX,
  CHANNEL_NAME_MAX,
  handleNote,
  handleShapeError,
  nameShapeError,
} from "./channelForm"

interface Props {
  onCreated: (channel: CreatedChannel) => void
}

export function ChannelGate({ onCreated }: Props) {
  const [name, setName] = useState("")
  const [handle, setHandle] = useState("")
  const [about, setAbout] = useState("")
  const [checking, setChecking] = useState(false)
  /** `null` means "no answer" — a check that has not run or that failed. */
  const [available, setAvailable] = useState<boolean | null>(null)
  const [suggestion, setSuggestion] = useState<string | undefined>(undefined)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const shapeError = handle.length > 0 ? handleShapeError(handle) : null
  // Only once there is something to be wrong about: telling somebody their
  // channel name is too short before they have typed anything is nagging.
  const nameError = name.trim().length > 0 ? nameShapeError(name) : null

  /* ── The availability check, debounced ─────────────────────────────────── */

  const checkRun = useRef(0)
  useEffect(() => {
    setAvailable(null)
    setSuggestion(undefined)
    // Never asked for a handle that is already illegal. The endpoint answers
    // `available: false` for a malformed handle as well as a taken one, so
    // reporting its verdict verbatim would say "taken" about a handle nobody
    // has ever had. See ./channelForm.ts.
    if (shapeError || handle.length === 0) return

    const token = ++checkRun.current
    setChecking(true)
    const timer = setTimeout(() => {
      void checkHandleAvailable(handle, name.trim() || handle)
        .then((res) => {
          if (token !== checkRun.current) return
          setAvailable(res.available)
          setSuggestion(res.suggestion)
        })
        .catch(() => {
          // A failed check is not a taken handle. The create call is the
          // authority — it answers 409 HANDLE_TAKEN — and blocking the button
          // over a network blip would strand somebody on this screen.
          if (token === checkRun.current) setAvailable(null)
        })
        .finally(() => {
          if (token === checkRun.current) setChecking(false)
        })
    }, 400)

    return () => {
      clearTimeout(timer)
      setChecking(false)
    }
  }, [handle, name, shapeError])

  const submit = useCallback(async () => {
    setError(null)
    const trimmedName = name.trim()
    const nameProblem = nameShapeError(trimmedName)
    if (nameProblem) {
      setError(nameProblem)
      return
    }
    const shape = handleShapeError(handle)
    if (shape) {
      setError(shape)
      return
    }

    setSubmitting(true)
    try {
      const channel = await createChannel({
        name: trimmedName,
        handle,
        // `about`, not `description`. See the header.
        ...(about.trim() ? { about: about.trim() } : {}),
      })
      onCreated(channel)
    } catch (e) {
      setError(channelFailureMessage(e))
    } finally {
      setSubmitting(false)
    }
  }, [about, handle, name, onCreated])

  const note = handleNote({ handle, checking, available, suggestion })

  const blocked =
    submitting ||
    Boolean(nameShapeError(name)) ||
    Boolean(shapeError) ||
    handle.length === 0 ||
    // `available === null` — no answer — does NOT block. See the catch above.
    available === false

  return (
    <div className="mx-auto max-w-xl py-10">
      <h1 className="font-mo-display text-2xl tracking-mo-display text-mo-ink">
        Create your channel
      </h1>
      <p className="mt-2 text-sm text-mo-body">
        Videos post under your channel. You can change this later.
      </p>

      <div className="mt-6 space-y-5 rounded-mo border border-mo bg-mo-surface p-6 shadow-mo">
        <Field
          label="Channel name"
          hint={`${name.trim().length}/${CHANNEL_NAME_MAX}`}
          note={nameError}
          tone={nameError ? "bad" : "muted"}
        >
          <input
            className={inputClass}
            value={name}
            maxLength={CHANNEL_NAME_MAX}
            placeholder="Your channel's name"
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
          />
        </Field>

        <Field label="Handle" note={note?.text ?? null} tone={note?.tone ?? "muted"}>
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-sm text-mo-body">
              @
            </span>
            <input
              className={inputClass}
              value={handle}
              maxLength={CHANNEL_HANDLE_MAX}
              placeholder="yourhandle"
              // Lowercased as it is typed rather than refused afterwards. The
              // pattern forbids capitals and somebody typing their own name
              // has done nothing wrong.
              onChange={(e) => setHandle(e.target.value.toLowerCase().trim())}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="handle-note"
            />
          </div>
        </Field>

        <Field label="About (optional)" hint={`${about.length}/${CHANNEL_ABOUT_MAX}`}>
          <textarea
            className={`${inputClass} min-h-24 resize-y py-2`}
            value={about}
            maxLength={CHANNEL_ABOUT_MAX}
            placeholder="What your channel is about"
            onChange={(e) => setAbout(e.target.value)}
          />
        </Field>

        {error ? (
          <p role="alert" className="text-sm text-mo-bad">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          className="mo-btn-primary inline-flex h-11 items-center justify-center gap-2 rounded-mo-pill px-6"
          disabled={blocked}
          onClick={() => void submit()}
        >
          {submitting ? <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> : null}
          Create channel
        </button>
      </div>
    </div>
  )
}

/* ── Small local scaffolding ──────────────────────────────────────────────── */

const inputClass =
  "w-full rounded-mo border border-mo bg-mo-raised px-3 py-2 text-sm text-mo-ink placeholder:text-mo-muted-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mo"

function Field({
  label,
  hint,
  note,
  tone = "muted",
  children,
}: {
  label: string
  hint?: string
  note?: string | null
  tone?: "muted" | "bad" | "good"
  children: React.ReactNode
}) {
  const toneClass =
    tone === "bad" ? "text-mo-bad" : tone === "good" ? "text-mo-good" : "text-mo-body"
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-mo-ink">{label}</span>
        {hint ? <span className="text-xs text-mo-body">{hint}</span> : null}
      </span>
      <span className="mt-1.5 block">{children}</span>
      {note ? (
        <span id="handle-note" className={`mt-1 block text-xs ${toneClass}`}>
          {note}
        </span>
      ) : null}
    </label>
  )
}
