"use client"

/**
 * What the viewer will see — drawn by the WATCH PAGE'S OWN COMPONENTS.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * `CardPrompt` AND `EndScreenOverlay` ARE IMPORTED, NOT REIMPLEMENTED
 *
 * This is the whole value of the preview and the reason it is worth having at
 * all. A preview built out of its own markup is a second opinion about what a
 * card looks like, and the two drift the moment either side is touched — at
 * which point the preview is worse than nothing, because it is confidently
 * wrong. These are the same two components `WatchScreen` mounts over the
 * player, given the same two row types.
 *
 * There is no zone boundary in the way: `src/links/` and `src/watch/` are two
 * directories of one Next application. The rule that zones may not import from
 * each other is about apps/*, and it is not what this crosses. The dependency
 * runs one way only — the watch page must keep working with no editor in the
 * build, and nothing in `src/watch/` imports from here.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS IS NOT
 *
 * There is no video in it. Mounting a player would mean hls.js, a master
 * playlist and a real watch session for a surface whose whole subject is the
 * boxes drawn ON TOP of the picture — and a WatchSession started here would
 * arrive at the analytics ingest as a view of a video nobody watched. The
 * frame is a flat plate at the player's own aspect ratio, and it says so.
 *
 * The rows fed in are SYNTHESISED from the draft, not read back from the
 * server, so what is on screen is the unsaved state — which is the point: a
 * creator checks the placement before saving, not after.
 */

import { useState } from "react"
import { Film } from "lucide-react"
import type { EndScreen, VideoCard } from "@/watch/api"
import { CardPrompt, EndScreenOverlay } from "@/watch/Overlays"
import { chapterClock } from "@/watch/timeline"
import type { AlternateDraft } from "./model"
import { UP_NEXT_POSITION, hasUpNext, type UpNextDraft, type UpNextWindow } from "./upnext"

export interface LinkPreviewProps {
  alternates: readonly AlternateDraft[]
  upNext: UpNextDraft
  upNextWindow: UpNextWindow | null
  /** For the `channel_subscribe` case, which this editor never writes. */
  channelName: string
}

/**
 * A draft as the row the watch page renders.
 *
 * The synthetic `id` is prefixed so it can never collide with a real one, and
 * because `CardPrompt`'s dismissal is remembered by id: two drafts that both
 * produced `id: ""` would dismiss each other.
 */
function asCard(draft: AlternateDraft): VideoCard {
  return {
    id: `preview-${draft.key}`,
    post_id: "preview",
    type: "video",
    target_id: draft.targetId || null,
    title: draft.title.trim() || "Untitled alternate",
    teaser_text: draft.teaser.trim() || null,
    appear_at_ms: Math.max(0, Math.round(draft.atMs)),
  }
}

function asEndScreen(draft: UpNextDraft, window: UpNextWindow): EndScreen {
  return {
    id: "preview-upnext",
    post_id: "preview",
    type: "video",
    target_id: draft.targetId || null,
    title: draft.title.trim() || null,
    position: { ...UP_NEXT_POSITION },
    start_ms: window.startMs,
    end_ms: window.endMs,
  }
}

export function LinkPreview({
  alternates,
  upNext,
  upNextWindow,
  channelName,
}: LinkPreviewProps) {
  /**
   * Which of the three moments is being previewed.
   *
   * A card and an end screen are almost never on screen together — cards sit
   * mid-video and the up-next tile sits in the closing stretch — so drawing
   * every draft at once would show an arrangement no viewer ever sees. The
   * moments are the ones the drafts themselves define, and the default is the
   * first thing that happens.
   */
  const [moment, setMoment] = useState(0)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const placed = alternates
    .filter((a) => a.title.trim() || a.targetId)
    .slice()
    .sort((a, b) => a.atMs - b.atMs)

  const moments: { label: string; card: VideoCard | null; screens: EndScreen[] }[] = [
    ...placed.map((draft) => ({
      label: chapterClock(draft.atMs),
      card: asCard(draft),
      screens: [] as EndScreen[],
    })),
    ...(hasUpNext(upNext) && upNextWindow
      ? [
          {
            label: `${chapterClock(upNextWindow.startMs)} — end`,
            card: null,
            screens: [asEndScreen(upNext, upNextWindow)],
          },
        ]
      : []),
  ]

  const current = moments[Math.min(moment, Math.max(0, moments.length - 1))] ?? null

  return (
    <section aria-labelledby="link-preview-heading" className="rounded-mo border border-mo bg-mo-surface p-4">
      <h2
        id="link-preview-heading"
        className="font-mo-display text-[15px] font-semibold tracking-mo-display text-mo-ink"
      >
        Preview
      </h2>
      <p className="mt-1 text-[13px] text-mo-body">
        Drawn by the same components the watch page uses. The picture is a
        placeholder — nothing plays here.
      </p>

      {moments.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Preview a moment">
          {moments.map((m, index) => (
            <button
              key={m.label + index}
              type="button"
              onClick={() => setMoment(index)}
              aria-pressed={index === moment}
              className={`rounded-mo-pill border px-3 py-1 text-[12px] font-semibold transition-colors duration-150 ease-mo focus-visible:outline focus-visible:outline-2 focus-visible:outline-mo ${
                index === moment
                  ? "border-mo-strong bg-mo-raised text-mo-ink"
                  : "border-mo text-mo-body hover:bg-mo-raised"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-mo bg-black">
        {/* The plate. Not a poster: a by-author row carries no `variants`, so
            there is no thumbnail to draw even if one were wanted here. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/30">
          <Film aria-hidden className="h-8 w-8" />
          <span className="text-[12px]">Your video</span>
        </div>

        {current?.card && (
          <CardPrompt
            card={current.card}
            onDismiss={(id) => setDismissed((was) => new Set(was).add(id))}
          />
        )}
        {current && current.screens.length > 0 && (
          <EndScreenOverlay screens={current.screens} channelName={channelName} />
        )}

        {moments.length === 0 && (
          <p className="absolute inset-x-4 bottom-4 text-center text-[12px] text-white/50">
            Nothing is linked yet, so a viewer sees only the video.
          </p>
        )}
      </div>

      {dismissed.size > 0 && (
        <p className="mt-2 text-[12px] text-mo-body">
          You dismissed a card in this preview. A viewer can dismiss it too, and
          it stays dismissed for the rest of their view.
        </p>
      )}
    </section>
  )
}
