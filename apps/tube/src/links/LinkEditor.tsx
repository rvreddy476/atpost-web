"use client"

/**
 * `/tube/links/{postId}` — the linked-video authoring screen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ONE SCREEN, THREE MECHANISMS, ONE SAVE
 *
 * The founder asked for two things and the platform has three primitives:
 *
 *     "I can link one video to another video, alternate videos kind of things"
 *          -> in-video CARDS. Unordered, timestamped. ./AlternatesSection.
 *     "one to three sequence of videos"
 *          -> a video SERIES. Ordered, `episode_num`. ./SequenceSection.
 *
 * and END SCREENS, which are a placement primitive rather than a linking one
 * and are used here for exactly one thing — the up-next tile. ./UpNextSection.
 *
 * They are one screen because they are one question ("what does this video
 * link to?") and because two of the three are FULL REPLACES: a creator who
 * edits cards on one page and end screens on another has no way to see that
 * the two together are what a viewer meets.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE UNSAVED STATE IS THE MOST IMPORTANT THING ON THE PAGE
 *
 * `POST …/cards` deletes every row for the post and inserts the body. So the
 * dangerous state is not "unsaved", it is "half-edited and saved" — and the
 * bar at the bottom exists to make the first one loud enough that the second
 * never happens by accident. It says which sections have changed, it is
 * sticky, and it is joined by a `beforeunload` guard.
 *
 * Nothing autosaves. See the header of ./useLinkEditor.ts.
 */

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, Check, Loader2 } from "lucide-react"
import { useSession } from "@atpost/api-client/session"
import { TUBE_SIGN_IN_HREF } from "@/chrome/links"
import { chapterClock } from "@/watch/timeline"
import { AlternatesSection } from "./AlternatesSection"
import { LinkPreview } from "./LinkPreview"
import { SequenceSection } from "./SequenceSection"
import { UpNextSection } from "./UpNextSection"
import { Action } from "./ui"
import { useLinkEditor } from "./useLinkEditor"

const SECTION_NAMES = {
  alternates: "Alternate videos",
  sequence: "Sequence",
  upnext: "Up next",
} as const

export function LinkEditor({ postId }: { postId: string }) {
  const { signedIn, status: sessionStatus, user } = useSession()
  const editor = useLinkEditor(postId, signedIn ? (user?.id ?? null) : null)
  const { state } = editor

  /**
   * The browser's own guard, on top of the bar.
   *
   * It is the only thing that catches a closed tab or a typed URL, which is
   * where an in-page prompt cannot reach. It is deliberately NOT paired with a
   * router-level intercept: Next's App Router has no supported navigation
   * guard, and the ones people build out of `popstate` break the back button
   * in ways that are worse than the problem.
   */
  useEffect(() => {
    if (!state.anyDirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [state.anyDirty])

  if (sessionStatus === "unknown") return <Centered>Checking your session…</Centered>

  if (!signedIn) {
    return (
      <Centered>
        <p className="text-mo-body">Sign in to edit the links on your videos.</p>
        <a
          href={TUBE_SIGN_IN_HREF}
          className="mt-4 inline-block rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
        >
          Sign in
        </a>
      </Centered>
    )
  }

  if (state.status === "loading") return <Centered>Reading this video&rsquo;s links…</Centered>

  if (state.status !== "ready" || !state.subject) {
    return (
      <Centered>
        <AlertTriangle aria-hidden className="mx-auto h-8 w-8 text-mo-warn" />
        <p className="mt-3 text-mo-body">{state.problem ?? "This video could not be opened."}</p>
        <Link
          href="/links"
          className="mt-4 inline-block rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"
        >
          Back to your videos
        </Link>
      </Centered>
    )
  }

  const subject = state.subject
  const dirtySections = (Object.keys(state.dirty) as (keyof typeof state.dirty)[]).filter(
    (key) => state.dirty[key]
  )

  return (
    <div className="pb-28">
      <Link
        href="/links"
        className="inline-flex items-center gap-1.5 rounded-mo text-[13px] text-mo-cyan transition-colors duration-150 ease-mo hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo"
      >
        <ArrowLeft aria-hidden className="h-4 w-4" />
        Your videos
      </Link>

      <header className="mt-3">
        <h1 className="font-mo-display text-2xl font-semibold tracking-mo-display text-mo-ink">
          Links on &ldquo;{subject.title}&rdquo;
        </h1>
        <p className="mt-1 text-[13px] text-mo-body">
          {subject.durationMs > 0
            ? `${chapterClock(subject.durationMs)} long. `
            : "Length not recorded yet. "}
          <Link
            href={`/${subject.id}`}
            className="text-mo-cyan transition-colors duration-150 ease-mo hover:underline"
          >
            Open the watch page
          </Link>
        </p>
      </header>

      <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start">
        <div className="space-y-4">
          <AlternatesSection
            drafts={state.alternates}
            problems={state.alternateProblems}
            library={state.library}
            libraryTruncated={state.libraryTruncated}
            subjectId={subject.id}
            durationMs={subject.durationMs}
            upNextWindow={editor.upNextWindow}
            passthroughCount={state.passthroughCards.length}
            dirty={state.dirty.alternates}
            onAdd={editor.addAlternate}
            onUpdate={editor.updateAlternate}
            onRemove={editor.removeAlternate}
          />

          <SequenceSection
            seriesList={state.seriesList}
            seriesId={state.seriesId}
            savedEpisodes={state.savedEpisodes}
            slots={state.slots}
            problems={state.slotProblems}
            stranded={state.stranded}
            library={state.library}
            libraryTruncated={state.libraryTruncated}
            subjectId={subject.id}
            dirty={state.dirty.sequence}
            onChooseSeries={(id) => void editor.chooseSeries(id)}
            onCreateSeries={(title, description) => void editor.makeSeries(title, description)}
            onSetSlots={editor.setSlots}
            onAddSlot={editor.addSlot}
          />

          <UpNextSection
            draft={state.upNext}
            window={editor.upNextWindow}
            durationMs={subject.durationMs}
            library={state.library}
            libraryTruncated={state.libraryTruncated}
            subjectId={subject.id}
            passthroughCount={state.passthroughScreens.length}
            dirty={state.dirty.upnext}
            onChange={editor.setUpNext}
          />
        </div>

        {/* Sticky beside the form on a wide screen, so the placement being
            edited and the picture of it are on screen together. */}
        <div className="xl:sticky xl:top-[72px]">
          <LinkPreview
            alternates={state.alternates}
            upNext={state.upNext}
            upNextWindow={editor.upNextWindow}
            channelName="Your channel"
          />
        </div>
      </div>

      {/* ── The save bar ───────────────────────────────────────────────── */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-mo bg-mo-surface/95 backdrop-blur-sm"
        role="region"
        aria-label="Save your changes"
      >
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <p aria-live="polite" className="min-w-0 flex-1 text-[13px]">
            {state.saving ? (
              <span className="flex items-center gap-2 text-mo-body">
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                Saving…
              </span>
            ) : state.anyDirty ? (
              <span className="text-mo-warn">
                Unsaved changes in {dirtySections.map((k) => SECTION_NAMES[k]).join(", ")}.
                Saving replaces every card and end screen on this video at once.
              </span>
            ) : state.outcomes.length > 0 ? (
              <span className="flex flex-col gap-1">
                {state.outcomes.map((outcome) => (
                  <span
                    key={outcome.section}
                    className={outcome.ok ? "flex items-center gap-1.5 text-mo-good" : "flex items-center gap-1.5 text-mo-bad"}
                  >
                    {outcome.ok ? (
                      <Check aria-hidden className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
                    )}
                    <span>
                      {SECTION_NAMES[outcome.section]}: {outcome.message}
                    </span>
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-mo-body">Everything here matches what is saved.</span>
            )}
          </p>

          <div className="flex shrink-0 items-center gap-2">
            <Action onClick={editor.discard} disabled={!state.anyDirty || state.saving}>
              Discard
            </Action>
            <Action
              variant="primary"
              onClick={() => void editor.save()}
              disabled={!state.anyDirty || state.saving}
            >
              Save links
            </Action>
          </div>
        </div>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      {children}
    </div>
  )
}
