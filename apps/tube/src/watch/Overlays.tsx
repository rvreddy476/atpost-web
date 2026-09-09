"use client"

/**
 * The two things drawn ON the picture: the in-video card, and the end screen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE BOTH OF THESE OBEY: DO NOT TAKE THE PLAYER AWAY
 *
 * @momentum/player puts the speaker top-RIGHT and the play/pause and seek bar
 * bottom-LEFT, and this page's own "Full video" control is bottom-RIGHT. Every
 * overlay here is placed and sized so that none of those is under it, and every
 * container that spans the frame is `pointer-events-none` with the interactive
 * parts turning events back on individually. An overlay that eats a click meant
 * for the scrubber is a video somebody cannot pause.
 *
 * That is also why neither of these is a `<dialog>` and neither traps focus. A
 * modal over a playing video is the wrong shape: it steals the keyboard from
 * the transport, and Escape — which the theatre mode uses to un-expand — would
 * mean two different things depending on what happened to have focus. These are
 * ordinary controls in the document's tab order, in reading order, after the
 * player.
 */

import { useCallback } from "react"
import Link from "next/link"
import { ExternalLink, Play, X } from "lucide-react"
import type { EndScreen, VideoCard } from "./api"
import { cardDestination, endScreenDestination, type Destination } from "./links"
import { endScreenSlot } from "./timeline"

/* ── The in-video card ──────────────────────────────────────────────────── */

export interface CardPromptProps {
  card: VideoCard
  onDismiss: (cardId: string) => void
}

/**
 * A card, as a dismissible corner prompt.
 *
 * ── Top-left, and it is the only corner available ─────────────────────────
 * Top-right is the speaker, bottom-left is the transport, bottom-right is
 * "Full video". Top-left is also where YouTube's own teaser sits, so the
 * position is one people already have.
 *
 * ── The close button is a real button with a real name ────────────────────
 * Not an "×" glyph with no accessible name, and not a click-anywhere-to-dismiss
 * region: the second is invisible to a keyboard and indistinguishable from a
 * click on the video. Dismissal is remembered by id for the whole view (see
 * `activeCard` in ./timeline.ts), so this is a decision somebody makes once.
 *
 * ── A card with nowhere to go is still shown ──────────────────────────────
 * `poll` and `playlist` targets have no web surface, so `cardDestination`
 * answers null and the prompt renders as an announcement rather than a link.
 * The alternative — hiding it — would mean an author's card silently does not
 * exist on the web, which is worse than a card that says something and does not
 * navigate.
 */
export function CardPrompt({ card, onDismiss }: CardPromptProps) {
  const destination = cardDestination(card)
  const dismiss = useCallback(() => onDismiss(card.id), [card.id, onDismiss])

  const body = (
    <>
      <span className="block text-[13px] font-semibold leading-snug text-white">
        {card.title}
      </span>
      {card.teaser_text && (
        <span className="mt-0.5 block text-[12px] leading-snug text-white/75">
          {card.teaser_text}
        </span>
      )}
    </>
  )

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-20 max-w-[min(320px,70%)]">
      <div className="pointer-events-auto flex items-start gap-2 rounded-mo bg-black/80 p-3 shadow-mo backdrop-blur-sm">
        <span aria-hidden className="mt-0.5 shrink-0 text-mo-cyan">
          {destination?.kind === "external" ? (
            <ExternalLink className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <Target destination={destination} label={card.title}>
            {body}
          </Target>
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label={`Dismiss the card: ${card.title}`}
          className="-m-1 shrink-0 rounded-mo p-1 text-white/70 transition-colors duration-150 ease-mo hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/* ── The end screen ─────────────────────────────────────────────────────── */

export interface EndScreenOverlayProps {
  screens: EndScreen[]
  /** Rendered for a `channel_subscribe` tile — the channel's own name. */
  channelName: string
  /** The subscribe control to draw in a `channel_subscribe` tile, if any. */
  subscribe?: React.ReactNode
}

/**
 * The end screen — positioned tiles over the last part of the video.
 *
 * ── The bottom of the frame is left alone ─────────────────────────────────
 * `bottom-16` on the container, so the transport and the "Full video" control
 * are never underneath a tile no matter what `position` a row carries. A tile's
 * own top/left are clamped inside THIS box rather than inside the frame, which
 * is what keeps an authored `y: 95` from landing on the seek bar.
 *
 * ── Unpositioned tiles are laid out rather than dropped ───────────────────
 * `position` is `JSONB NOT NULL` with no schema and no writer anywhere in the
 * product, so a real payload may carry a shape nobody here has seen.
 * `endScreenSlot` answers null for those and they fall into a flow row along
 * the bottom of the box. A tile in an approximate place is a cosmetic problem;
 * a tile at `NaN%` is an invisible one.
 */
export function EndScreenOverlay({ screens, channelName, subscribe }: EndScreenOverlayProps) {
  if (screens.length === 0) return null

  const positioned = screens.filter((s) => endScreenSlot(s.position) !== null)
  const unpositioned = screens.filter((s) => endScreenSlot(s.position) === null)

  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-16 top-0 z-20"
      // The whole overlay is one labelled region so a screen reader announces
      // what these tiles are before reading them, rather than four unexplained
      // links appearing in the middle of a page.
      role="group"
      aria-label="Suggestions for what to watch next"
    >
      {positioned.map((screen) => {
        const slot = endScreenSlot(screen.position)!
        return (
          <div
            key={screen.id}
            className="pointer-events-auto absolute"
            style={{
              left: `${slot.leftPct}%`,
              top: `${slot.topPct}%`,
              width: `${slot.widthPct}%`,
              height: `${slot.heightPct}%`,
            }}
          >
            <EndScreenTile screen={screen} channelName={channelName} subscribe={subscribe} />
          </div>
        )
      })}

      {unpositioned.length > 0 && (
        <div className="pointer-events-auto absolute inset-x-3 bottom-3 flex flex-wrap gap-2">
          {unpositioned.map((screen) => (
            <div key={screen.id} className="min-w-[160px] flex-1">
              <EndScreenTile screen={screen} channelName={channelName} subscribe={subscribe} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EndScreenTile({
  screen,
  channelName,
  subscribe,
}: {
  screen: EndScreen
  channelName: string
  subscribe?: React.ReactNode
}) {
  /**
   * `channel_subscribe` is not a link and must not be rendered as one — it is
   * the subscribe control, and the control the page already has is the real one
   * (optimistic, with rollback, and honest about the `requested` state a
   * private account produces). It is passed in rather than rebuilt.
   */
  if (screen.type === "channel_subscribe") {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-2 rounded-mo bg-black/80 p-3 shadow-mo backdrop-blur-sm">
        <span className="line-clamp-2 text-[13px] font-semibold leading-snug text-white">
          {screen.title?.trim() || channelName}
        </span>
        {subscribe ?? (
          <span className="text-[12px] text-white/70">Subscribing is not available here.</span>
        )}
      </div>
    )
  }

  const destination = endScreenDestination(screen)
  const label = screen.title?.trim() || "Watch next"

  return (
    <div className="h-full rounded-mo bg-black/80 shadow-mo backdrop-blur-sm">
      <Target
        destination={destination}
        label={label}
        className="flex h-full items-center gap-2 rounded-mo p-3"
      >
        <span aria-hidden className="shrink-0 text-mo-cyan">
          {destination?.kind === "external" ? (
            <ExternalLink className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </span>
        <span className="line-clamp-3 text-[13px] font-semibold leading-snug text-white">
          {label}
        </span>
      </Target>
    </div>
  )
}

/* ── The one place a target becomes a link, or does not ─────────────────── */

/**
 * Renders children as a link when there is somewhere to go, and as plain text
 * when there is not.
 *
 * `next/link` for an internal href — these are `/tube/{id}` in the same zone,
 * so a client navigation is right. A plain `<a>` with `rel="noopener
 * noreferrer"` and `target="_blank"` for an external one: `target_url` is
 * author-supplied free text on a table with no validation, so the new context
 * must not get a handle on this window, and this page must not lose a video
 * somebody is watching to a link they may not have meant to follow.
 *
 * `externalDestination` in ./links.ts has already refused anything that is not
 * http(s), so a `javascript:` URL never reaches here.
 */
function Target({
  destination,
  label,
  className,
  children,
}: {
  destination: Destination
  label: string
  className?: string
  children: React.ReactNode
}) {
  const focus =
    "rounded-mo focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"

  if (!destination) {
    return <span className={className}>{children}</span>
  }
  if (destination.kind === "internal") {
    return (
      <Link href={destination.href} aria-label={label} className={`${className ?? ""} ${focus}`}>
        {children}
      </Link>
    )
  }
  return (
    <a
      href={destination.href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in a new tab)`}
      className={`${className ?? ""} ${focus}`}
    >
      {children}
    </a>
  )
}
