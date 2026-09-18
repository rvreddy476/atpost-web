"use client"

/**
 * The upload studio: everything above joined up.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE SHAPE, AND WHY IT IS THIS SHAPE
 *
 *     "A stepped studio, not one giant form. Pick the file, then details, then
 *      visibility and compliance, then publish. Upload runs in the background
 *      from the moment the file is chosen."
 *
 * So the steps are a reading order, not a pipeline. The transfer does not wait
 * for them and they do not wait for it: from the instant a file is picked the
 * bytes are moving, the filmstrip is being cut out of the same local file, and
 * the form is editable. The only thing that waits is Publish, and it waits on
 * exactly one condition — the asset being `ready` + `passed`.
 *
 * ── The four honest failures ──────────────────────────────────────────────
 * Each is handled where it happens rather than collapsed into "something went
 * wrong":
 *
 *   · the signed URL expiring mid-upload — `UploadTransportError` with a 403,
 *     named as an expiry, retryable, and a retry mints a fresh URL;
 *   · moderation returning `rejected` — terminal, and the strip says trying
 *     the same file again will get the same answer;
 *   · the transcode returning `failed` — terminal, with the one piece of
 *     actionable advice there is (re-export as H.264 MP4);
 *   · a creator with no channel — caught BEFORE the picker, because
 *     `POST /v1/posts` fails closed with 403 CHANNEL_REQUIRED and finding
 *     that out after a transcode is the worst possible moment.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { CheckCircle2, CloudOff, Cloud, Loader2, RotateCcw } from "lucide-react"
import { useSession } from "@atpost/api-client/session"
import { fetchCategories, fetchOwnChannel, type TubeCategory } from "@/tube/channelApi"
import { channelHref, channelRef, type TubeChannel } from "@/tube/channels"
import {
  createLongVideoPost,
  publishVideo,
  setCoverFrame,
  uploadFailureMessage,
} from "@/tube/uploadApi"
import { TUBE_SIGN_IN_HREF } from "@/chrome/links"
import { addSeriesEpisode, writeFailureMessage } from "@/links/api"
import { ChannelGate } from "./ChannelGate"
import {
  emptyDraft,
  publishAction,
  toCreateRequest,
  validateDraft,
  type VideoDraft,
} from "./fields"
import { canPublish, isActive, mayPublish } from "./machine"
import { StepDetails } from "./StepDetails"
import { StepFile } from "./StepFile"
import { StepReview } from "./StepReview"
import { StepSettings } from "./StepSettings"
import { UploadStatus } from "./UploadStatus"
import { useCoverStudio } from "./useCoverStudio"
import { useDraftAutosave } from "./useDraftAutosave"
import { useSeriesPicker } from "./useSeriesPicker"
import { useVideoUpload } from "./useVideoUpload"

/**
 * What happened to the series after the post was made.
 *
 * Kept beside the upload state rather than in it: ./machine.ts is the
 * asset's life and "published" is its last word. The episode is a second
 * write about a post that already exists, and its failure does not un-post
 * anything, so it is a note on the Posted screen and not a phase.
 */
interface SeriesOutcome {
  title: string
  episodeNum: number
  /** The sentence for a failed episode write. Null when it was added. */
  failure: string | null
}

type Step = "file" | "details" | "settings" | "review"

const STEPS: { id: Step; label: string }[] = [
  { id: "file", label: "Video" },
  { id: "details", label: "Details" },
  { id: "settings", label: "Visibility" },
  { id: "review", label: "Post" },
]

export function UploadStudio() {
  const { signedIn, status, userId } = useSession()

  /* ── The channel gate ──────────────────────────────────────────────────── */

  const [channel, setChannel] = useState<TubeChannel | null>(null)
  const [channelLoaded, setChannelLoaded] = useState(false)
  const [channelError, setChannelError] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unknown") return
    if (!signedIn) {
      setChannelLoaded(true)
      return
    }
    let live = true
    fetchOwnChannel()
      .then((own) => {
        if (live) setChannel(own)
      })
      .catch(() => {
        // `fetchOwnChannel` already turns 404 NO_CHANNEL and 401 into null, so
        // reaching here means the server is broken rather than that there is
        // no channel. Those are different facts and the screen says different
        // things about them: showing the create-a-channel form to somebody
        // who HAS a channel would invite a 409 CHANNEL_EXISTS for no reason.
        if (live) setChannelError("Your channel could not be read. Reload the page and try again.")
      })
      .finally(() => {
        if (live) setChannelLoaded(true)
      })
    return () => {
      live = false
    }
  }, [signedIn, status])

  /* ── The taxonomy ──────────────────────────────────────────────────────── */

  const [categories, setCategories] = useState<TubeCategory[]>([])
  useEffect(() => {
    let live = true
    fetchCategories()
      .then((rows) => {
        if (live) setCategories(rows)
      })
      .catch(() => {
        // The fallback list in ./fields.ts is the same one the phone falls
        // back to, so a failure here costs nothing.
      })
    return () => {
      live = false
    }
  }, [])

  /* ── The studio proper ─────────────────────────────────────────────────── */

  const [step, setStep] = useState<Step>("file")
  const [file, setFile] = useState<File | null>(null)
  const [draft, setDraft] = useState<VideoDraft>(emptyDraft)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState<string | null>(null)
  const [seriesOutcome, setSeriesOutcome] = useState<SeriesOutcome | null>(null)

  const upload = useVideoUpload()
  const cover = useCoverStudio(file)
  const series = useSeriesPicker(userId ?? null, draft.seriesId, Boolean(signedIn && channel))

  /**
   * The draft, saved as they type.
   *
   * ── It is persistence, not a publish route ────────────────────────────
   * `POST /v1/posts/drafts/{id}/publish` drops nine of this form's fields on
   * the way to `CreatePostInput` — see ../tube/uploadApi.ts, which lists
   * them. So the draft holds the work and `POST /v1/posts` publishes it, and
   * `discard()` deletes the draft afterwards. A draft that is abandoned stays
   * a draft for ever and never becomes a post, because the only call that
   * would turn one into a post is the one this studio does not make.
   *
   * ── A media id this tab never uploaded ────────────────────────────────
   * On a RESUMED draft the bytes are on the server and there is no `File`
   * here, so `upload.adopt` walks the machine to `processing` and starts the
   * same status poll the real upload uses. Within a poll or two the asset
   * reads `ready`/`passed` and Publish unlocks — without re-uploading a
   * gigabyte somebody already sent yesterday.
   */
  const [restoredCoverMediaId, setRestoredCoverMediaId] = useState<string | null>(null)
  const [restoreNote, setRestoreNote] = useState<string | null>(null)

  const mediaId = upload.state.mediaId
  const coverMediaId = cover.mediaId ?? restoredCoverMediaId

  const drafts = useDraftAutosave({
    draft,
    mediaId,
    coverMediaId,
    enabled: Boolean(signedIn && channel),
  })

  const issues = useMemo(
    () => validateDraft(draft, undefined, series.facts),
    [draft, series.facts]
  )
  const patch = useCallback(
    (change: Partial<VideoDraft>) => setDraft((prev) => ({ ...prev, ...change })),
    []
  )

  /**
   * ONE idempotency key per attempt, minted when the file is chosen.
   *
   * Not per click and not inside `createLongVideoPost`. The header exists so
   * that a Publish which timed out on the way back — the post was written, the
   * response was lost — cannot be turned into a second video by pressing the
   * button again. A key minted per call would make every retry a fresh key and
   * the header would be pure ceremony. Verified: a non-UUID is 400
   * INVALID_IDEMPOTENCY_KEY, and an absent one is 400 MISSING_IDEMPOTENCY_KEY.
   */
  const idempotencyKey = useRef<string>("")

  const pickFile = useCallback(
    (picked: File) => {
      setFile(picked)
      setPublishError(null)
      idempotencyKey.current = crypto.randomUUID()
      upload.start(picked)
      setStep("details")
    },
    [upload]
  )

  const cancel = useCallback(() => {
    upload.cancel()
    setFile(null)
    setRestoredCoverMediaId(null)
    setRestoreNote(null)
    setPublishError(null)
    setStep("file")
  }, [upload])

  /** Open the unfinished draft the server is holding. */
  const resumeDraft = useCallback(() => {
    const row = drafts.resumable
    if (!row) return
    const restored = drafts.resume(row)
    if (!restored) return

    setDraft(restored.draft)
    setRestoredCoverMediaId(restored.coverMediaId)
    idempotencyKey.current = crypto.randomUUID()
    setPublishError(null)
    setRestoreNote(
      restored.complete
        ? null
        : // Said out loud rather than discovered. The server's draft payload
          // is a closed set of keys and eleven of this form's fields have no
          // key in it (../studio/draftPayload.ts lists them); they live in
          // the browser that wrote them, so a draft opened somewhere else
          // comes back with those at their defaults.
          "This draft was started in another browser, so the licence, comment, remix and recording settings came back at their defaults. Check the Visibility step before posting."
    )

    if (restored.mediaId) {
      upload.adopt(restored.mediaId)
      setStep("details")
    } else {
      setStep("file")
    }
  }, [drafts, upload])

  /**
   * Leaving mid-upload.
   *
   * The transfer lives in this tab and dies with it — there is no service
   * worker and no resumable checkpoint on the web (the phone has one; see
   * ./useVideoUpload.ts). So a navigation away is a lost upload, and the
   * browser's own confirm is the only honest thing to put in front of it.
   *
   * Only while something is genuinely moving. Prompting on a finished or
   * failed upload is the behaviour that teaches people to click through the
   * dialog without reading it.
   */
  useEffect(() => {
    if (!isActive(upload.state)) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [upload.state])

  /* ── Publish ───────────────────────────────────────────────────────────── */

  const onPublish = useCallback(async () => {
    if (!mayPublish(upload.state) || !upload.state.mediaId) return
    if (validateDraft(draft, undefined, series.facts).length > 0) return

    setPublishError(null)
    setPublishing(true)
    upload.markPosting()

    // ── `canPublish`, not `mayPublish`, decides the ACTION ────────────────
    // The button unlocks as soon as the asset is confirmed (`mayPublish`),
    // because `POST /v1/posts` accepts a still-encoding one and holds the
    // post author-only until it is done. The extra
    // `POST /v1/videos/{id}/publish` does NOT: it is gated on
    // `video_metadata.upload_status` and answers 409 NOT_READY until the
    // transcode consumer flips it. So when the encode has not landed the
    // action is `create` and the call is skipped — the post reaches exactly
    // the same state on its own.
    const action = publishAction(draft, canPublish(upload.state))
    try {
      const body = toCreateRequest(draft, upload.state.mediaId, coverMediaId)
      const post = await createLongVideoPost(body, idempotencyKey.current)

      // The cover repair path. `cover_media_id` goes in at CREATE — verified
      // to work — so this only runs when the cover was still uploading when
      // Publish was pressed, which the button guards against but a race could
      // still produce. It is best-effort on purpose: a video that is live with
      // the auto thumbnail is a working video, and failing the publish over a
      // cover would be a much worse outcome than the wrong picture.
      if (coverMediaId && !body.cover_media_id) {
        await setCoverFrame(post.id, coverMediaId).catch(() => {})
      }

      // `:videoId` IS THE POST ID. Not the media id. And this runs only for
      // public + now, because the call is literally
      // `UPDATE posts SET visibility='public'` and would overrule a narrower
      // audience or an unreached schedule. See `publishAction`.
      if (action === "publish") {
        await publishVideo(post.id)
      }

      // The episode, last, and in its own try: the post exists and is live
      // by now, and a series write that fails must not turn that into a
      // "publish failed" that invites a second post. A failure is a sentence
      // on the Posted screen, with the link to where it can be fixed.
      //
      // `title: null` on purpose, matching the links editor: an episode with
      // no title of its own reads as the video's, and a copy of the video's
      // title stored on the episode row would go stale if the video's ever
      // changed.
      if (draft.seriesId && draft.seriesEpisodeNum !== null) {
        const chosen = series.list.find((s) => s.id === draft.seriesId)
        const outcome: SeriesOutcome = {
          title: chosen?.title ?? "the series",
          episodeNum: draft.seriesEpisodeNum,
          failure: null,
        }
        try {
          await addSeriesEpisode(draft.seriesId, {
            postId: post.id,
            episodeNum: draft.seriesEpisodeNum,
            title: null,
          })
        } catch (error) {
          outcome.failure = writeFailureMessage(error)
        }
        setSeriesOutcome(outcome)
      }

      // The post exists and is where it should be, so the draft has done its
      // job. Deleting it here rather than on the way out is what keeps an
      // abandoned draft and a published one distinguishable: a draft is only
      // ever removed by a publish that worked.
      drafts.discard()

      upload.markPublished(post.id, action === "schedule")
    } catch (error) {
      const message = uploadFailureMessage(error)
      setPublishError(message)
      // Back to `ready` rather than to `failed`: the ASSET is fine, the post
      // is what did not happen, and the person can press the button again
      // with the same idempotency key. Marking the upload failed here would
      // make somebody re-upload a perfectly good video because a 429 said
      // they had posted twenty things this hour.
      upload.markFailed(message, true)
    } finally {
      setPublishing(false)
    }
  }, [coverMediaId, draft, drafts, series.facts, series.list, upload])

  /* ── What is on screen ─────────────────────────────────────────────────── */

  if (status === "unknown" || !channelLoaded) {
    return (
      <div className="flex items-center justify-center py-24 text-mo-body">
        <Loader2 aria-hidden className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!signedIn) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <h1 className="font-mo-display text-2xl tracking-mo-display text-mo-ink">
          Sign in to upload
        </h1>
        <p className="mt-2 text-sm text-mo-body">
          A long video is published by a channel, and a channel belongs to an account.
        </p>
        <a
          // /login is served by the shell, never by a zone, so this is an
          // absolute path travelled by a plain <a>. next/link would prefix
          // this zone's basePath and ask for /tube/login.
          href={TUBE_SIGN_IN_HREF}
          className="mo-btn-primary mt-6 inline-flex h-11 items-center rounded-mo-pill px-6"
        >
          Sign in
        </a>
      </div>
    )
  }

  if (channelError) {
    return (
      <p role="alert" className="mx-auto max-w-md py-20 text-center text-sm text-mo-bad">
        {channelError}
      </p>
    )
  }

  if (!channel) {
    return <ChannelGate onCreated={(created) => setChannel(created as TubeChannel)} />
  }

  if (upload.state.phase === "published" && upload.state.postId) {
    return (
      <Posted
        postId={upload.state.postId}
        channel={channel}
        scheduled={upload.state.scheduled}
        series={seriesOutcome}
      />
    )
  }

  const ref = channelRef(channel)

  return (
    <div className="mx-auto max-w-6xl py-6">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-mo-display text-2xl tracking-mo-display text-mo-ink">New video</h1>
          <p className="mt-1 text-sm text-mo-body">
            Posting to {channel.name}
            {ref ? ` · @${ref}` : null}
          </p>
        </div>
        <DraftIndicator status={drafts.status} error={drafts.error} />
      </header>

      {/*
        ── Coming back to an unfinished video ───────────────────────────────
        Offered rather than restored automatically. Somebody who opened the
        studio to upload something new would find last week's half-finished
        video in the form, and the fix — cancel — looks exactly like throwing
        their draft away. So the draft waits until it is asked for.
      */}
      {drafts.resumable && upload.state.phase === "idle" ? (
        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-mo border border-mo-strong bg-mo-raised p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-mo-ink">You have a video in progress</p>
            <p className="mt-0.5 text-xs text-mo-body">
              {draftTitleOf(drafts.resumable) ?? "Untitled"} — saved{" "}
              {formatSavedAt(drafts.resumable.updated_at)}. The file is already uploaded.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button
              type="button"
              onClick={resumeDraft}
              className="inline-flex items-center gap-2 rounded-mo-pill border border-mo-strong px-4 py-2 text-sm text-mo-ink transition-colors duration-150 ease-mo hover:bg-mo-surface"
            >
              <RotateCcw aria-hidden className="h-3.5 w-3.5" />
              Pick up where I left off
            </button>
            <button
              type="button"
              onClick={drafts.dismissResumable}
              className="text-sm text-mo-body underline underline-offset-2 hover:text-mo-ink"
            >
              Start something new
            </button>
          </div>
        </section>
      ) : null}

      {restoreNote ? (
        <p className="mb-6 rounded-mo border border-mo bg-mo-surface p-4 text-sm text-mo-warn">
          {restoreNote}
        </p>
      ) : null}

      <Stepper
        current={step}
        // A resumed draft has a media id and no `File` — the bytes are on the
        // server and this tab never held them — so the steps are reachable on
        // either fact and not only on the picker having been used.
        reachable={file !== null || upload.state.mediaId !== null}
        onGo={setStep}
        invalidSteps={new Set(issues.map((i) => i.step))}
      />

      {upload.state.phase !== "idle" ? (
        <div className="mb-6">
          <UploadStatus
            state={upload.state}
            facts={upload.facts}
            statusNote={upload.statusNote}
            fileName={file?.name ?? null}
            resumable={upload.resumable}
            onRetry={upload.retry}
            onCancel={cancel}
          />
        </div>
      ) : null}

      {step === "file" ? (
        <StepFile onPick={pickFile} channelName={channel.name} />
      ) : step === "details" ? (
        <StepDetails
          draft={draft}
          patch={patch}
          issues={issues}
          cover={cover}
          categories={categories}
          series={series}
        />
      ) : step === "settings" ? (
        <StepSettings draft={draft} patch={patch} issues={issues} />
      ) : (
        <StepReview
          draft={draft}
          issues={issues}
          state={upload.state}
          cover={cover}
          publishing={publishing}
          publishError={publishError}
          seriesTitle={series.list.find((s) => s.id === draft.seriesId)?.title ?? null}
          channelName={channel.name}
          channelRef={ref}
          onPublish={() => void onPublish()}
          onGoToStep={setStep}
        />
      )}

      {step !== "file" && step !== "review" ? (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            className="rounded-mo-pill border border-mo-strong px-6 py-2.5 text-sm text-mo-ink transition-colors duration-150 ease-mo hover:bg-mo-raised"
            onClick={() => setStep(step === "details" ? "settings" : "review")}
          >
            Continue
          </button>
        </div>
      ) : null}
    </div>
  )
}

/* ── "Draft saved" ────────────────────────────────────────────────────────── */

/**
 * The quietest thing on the page, and deliberately.
 *
 * ── `aria-live="polite"`, and nothing else ────────────────────────────────
 * A toast for every autosave is an interruption every two seconds. This is a
 * line of text in the header that changes when the state does, announced
 * politely so it lands between sentences rather than over them. The founder
 * asked for "show 'Draft saved' quietly" and this is the quietest version of
 * it that a screen reader can still hear.
 *
 * A FAILED save is the one case that gets a colour and a role, because it is
 * the only one that asks anything of the person: their work is still on the
 * page and it is not on the server.
 */
function DraftIndicator({
  status,
  error,
}: {
  status: "idle" | "saving" | "saved" | "error"
  error: string | null
}) {
  if (status === "idle") return null
  if (status === "error") {
    return (
      <p role="alert" className="flex items-center gap-1.5 text-xs text-mo-warn">
        <CloudOff aria-hidden className="h-3.5 w-3.5" />
        {error ?? "The draft could not be saved."}
      </p>
    )
  }
  return (
    <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-mo-body">
      <Cloud aria-hidden className="h-3.5 w-3.5" />
      {status === "saving" ? "Saving draft…" : "Draft saved"}
    </p>
  )
}

/** The draft's own title, out of the payload the server handed back. */
function draftTitleOf(row: { payload?: unknown }): string | null {
  if (typeof row.payload !== "object" || row.payload === null) return null
  const title = (row.payload as Record<string, unknown>).title
  return typeof title === "string" && title.trim() ? title.trim() : null
}

/** "today at 14:02", or a date once it is not today. */
function formatSavedAt(iso?: string | null): string {
  if (!iso) return "a moment ago"
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return "a moment ago"
  const sameDay = new Date().toDateString() === at.toDateString()
  return sameDay
    ? `today at ${at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
    : at.toLocaleDateString(undefined, { day: "numeric", month: "short" })
}

/* ── The stepper ──────────────────────────────────────────────────────────── */

/**
 * Every step is reachable once a file exists, and none of them are gated on
 * the one before.
 *
 * That is deliberate and it is the opposite of a wizard. The steps here are a
 * reading order for a form whose fields are independent — somebody who knows
 * they want to schedule can go straight to Visibility and come back. Gating
 * them would add nothing except clicks, because the only real gate in this
 * studio is the asset being ready and that is on the button.
 */
function Stepper({
  current,
  reachable,
  onGo,
  invalidSteps,
}: {
  current: Step
  reachable: boolean
  onGo: (step: Step) => void
  invalidSteps: Set<string>
}) {
  return (
    <nav aria-label="Upload steps" className="mb-6 border-b border-mo">
      <ol className="flex flex-wrap gap-1">
        {STEPS.map((entry, index) => {
          const active = entry.id === current
          const disabled = !reachable && entry.id !== "file"
          const flagged = reachable && invalidSteps.has(entry.id)
          return (
            <li key={entry.id}>
              <button
                type="button"
                disabled={disabled}
                aria-current={active ? "step" : undefined}
                onClick={() => onGo(entry.id)}
                className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm transition-colors duration-150 ease-mo disabled:opacity-40 ${
                  active
                    ? "border-mo-cyan text-mo-ink"
                    : "border-transparent text-mo-body hover:text-mo-ink"
                }`}
              >
                <span aria-hidden className="tabular-nums text-xs text-mo-body">
                  {index + 1}
                </span>
                {entry.label}
                {flagged ? (
                  <span aria-hidden className="h-1.5 w-1.5 rounded-mo-pill bg-mo-bad" />
                ) : null}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

/* ── After ────────────────────────────────────────────────────────────────── */

function Posted({
  postId,
  channel,
  scheduled,
  series,
}: {
  postId: string
  channel: TubeChannel
  scheduled: boolean
  series: SeriesOutcome | null
}) {
  const ref = channelRef(channel)
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <CheckCircle2 aria-hidden className="mx-auto h-10 w-10 text-mo-good" />
      <h1 className="mt-4 font-mo-display text-2xl tracking-mo-display text-mo-ink">
        {scheduled ? "Scheduled" : "Posted"}
      </h1>
      <p className="mt-2 text-sm text-mo-body">
        {scheduled
          ? "It goes live at the time you picked. It is on your channel until then."
          : "It is on your channel now."}
      </p>
      {series && !series.failure && (
        <p className="mt-2 text-sm text-mo-body">
          Episode {series.episodeNum} of {series.title}.
        </p>
      )}
      {series?.failure && (
        /* The post is live; only the episode row is missing. Said as exactly
           that, with the server's own sentence, and with the one place the
           row can be written from. The href is zone-relative for the reason
           the two below give. */
        <p role="alert" className="mt-3 text-sm text-mo-warn">
          Posted, but it could not be added to the series: {series.failure}{" "}
          <Link href={`/links/${postId}`} className="underline underline-offset-2">
            Add it from Links.
          </Link>
        </p>
      )}
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {/*
          Both hrefs are ZONE-RELATIVE and both travel by `next/link`, which
          adds this zone's basePath itself. Writing "/tube/{id}" here and
          handing it to Link would ask for "/tube/tube/{id}" — the same trap
          `channelHref` in ../tube/channels.ts documents, and the one that
          made apps/reels request "/reels/social" from its own empty state.
          The watch page is this zone's root dynamic route, so the video is
          simply "/{postId}".
        */}
        <Link
          href={`/${postId}`}
          className="mo-btn-primary inline-flex h-11 items-center rounded-mo-pill px-6"
        >
          Watch it
        </Link>
        {ref ? (
          <Link
            href={channelHref(ref)}
            className="inline-flex h-11 items-center rounded-mo-pill border border-mo-strong px-6 text-sm text-mo-ink hover:bg-mo-raised"
          >
            Your channel
          </Link>
        ) : null}
      </div>

      {/*
        ── What to do next, and only what actually exists ───────────────────
        `POST /v1/posts/{id}/chapters`, `/cards` and `/end-screens` are all
        real routes, and on the WEB only one of them has an editor: the links
        page, which is cards, end screens and the series sequence. There is no
        chapters editor in this zone — `../watch/Chapters.tsx` reads them and
        nothing writes them — so chapters are named as a thing that exists
        without a link that would 404. Offering a dead link on a success screen
        is a worse outcome than not offering one.
      */}
      <div className="mt-8 border-t border-mo pt-6 text-left">
        <h2 className="text-sm font-semibold text-mo-ink">Finish it off</h2>
        <ul className="mt-2 space-y-2 text-sm text-mo-body">
          <li>
            <Link href={`/links/${postId}`} className="underline underline-offset-2 hover:text-mo-ink">
              Linked videos
            </Link>{" "}
            — the cards, the end screen and what plays next.
          </li>
          <li>
            Chapters are set from the video&apos;s own page once it has finished processing.
          </li>
        </ul>
      </div>

      <p className="mt-6 text-xs text-mo-body">
        Video id <span className="font-mo-mono">{postId}</span>
      </p>
    </div>
  )
}
