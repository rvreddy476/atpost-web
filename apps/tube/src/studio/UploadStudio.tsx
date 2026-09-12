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
import { CheckCircle2, Loader2 } from "lucide-react"
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
import { canPublish, isActive } from "./machine"
import { StepDetails } from "./StepDetails"
import { StepFile } from "./StepFile"
import { StepReview } from "./StepReview"
import { StepSettings } from "./StepSettings"
import { UploadStatus } from "./UploadStatus"
import { useCoverStudio } from "./useCoverStudio"
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
    setPublishError(null)
    setStep("file")
  }, [upload])

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
    if (!canPublish(upload.state) || !upload.state.mediaId) return
    if (validateDraft(draft, undefined, series.facts).length > 0) return

    setPublishError(null)
    setPublishing(true)
    upload.markPosting()

    const action = publishAction(draft)
    try {
      const body = toCreateRequest(draft, upload.state.mediaId, cover.mediaId)
      const post = await createLongVideoPost(body, idempotencyKey.current)

      // The cover repair path. `cover_media_id` goes in at CREATE — verified
      // to work — so this only runs when the cover was still uploading when
      // Publish was pressed, which the button guards against but a race could
      // still produce. It is best-effort on purpose: a video that is live with
      // the auto thumbnail is a working video, and failing the publish over a
      // cover would be a much worse outcome than the wrong picture.
      if (cover.mediaId && !body.cover_media_id) {
        await setCoverFrame(post.id, cover.mediaId).catch(() => {})
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
  }, [cover.mediaId, draft, series.facts, series.list, upload])

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
      <header className="mb-6">
        <h1 className="font-mo-display text-2xl tracking-mo-display text-mo-ink">New video</h1>
        <p className="mt-1 text-sm text-mo-body">
          Posting to {channel.name}
          {ref ? ` · @${ref}` : null}
        </p>
      </header>

      <Stepper
        current={step}
        reachable={file !== null}
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
      <p className="mt-6 text-xs text-mo-body">
        Video id <span className="font-mo-mono">{postId}</span>
      </p>
    </div>
  )
}
