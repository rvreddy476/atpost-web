"use client"

/**
 * What the watch page shows instead of a video, and the distinctions it keeps.
 *
 * There are four different reasons a `/tube/{postId}` has nothing to play and
 * they are NOT interchangeable, because each of them is true of a different
 * thing and each has a different answer:
 *
 *   · nobody is signed in         — there is no anonymous long-video feed at
 *                                   all; sign in and this works.
 *   · the request failed          — try again; the video is probably fine.
 *   · the id is not in this
 *     viewer's ranked videos      — nothing failed. The link may be to a
 *                                   private post, a blocked author, or a video
 *                                   this account genuinely cannot see.
 *   · the row is real but carries
 *     no playable media           — the post exists, it is on this page, and
 *                                   the picture is the only missing part.
 *
 * Collapsing any two of them produces a page that says "we could not find it"
 * about a video it is currently displaying the title of, which is the failure
 * this file exists to prevent.
 */

import Link from "next/link"
import { AlertTriangle, Search, Tv, VideoOff } from "lucide-react"
import { BRAND } from "@momentum/brand"
import { signInHref } from "@momentum/chrome"
import { ZONE } from "@/zone"

const ACTION =
  "mt-5 inline-block rounded-mo-pill border border-mo-strong px-4 py-2 text-sm font-semibold " +
  "text-mo-cyan transition-colors duration-150 ease-mo hover:bg-mo-raised"

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-mo border border-mo bg-mo-surface p-8 text-center shadow-mo">
      {children}
    </div>
  )
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="mt-4 font-mo-display text-xl font-semibold tracking-mo-display text-mo-ink">
      {children}
    </h1>
  )
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mx-auto mt-2 max-w-sm text-mo-body">{children}</p>
}

/**
 * `next/link` and a zone-relative "/" — NOT "/tube".
 *
 * Next prefixes this zone's basePath itself, so `href="/tube"` would ask for
 * `/tube/tube`. It is the same trap `videoHref` in ../tube/video.ts carries a
 * test for, and it is worth repeating here because an empty state is exactly
 * the page nobody clicks through in review.
 */
export function BackToTube({ label = "Back to Tube" }: { label?: string }) {
  return (
    <Link href="/" className={ACTION}>
      {label}
    </Link>
  )
}

/**
 * The video is being looked for.
 *
 * The shape of the real page: a 16:9 block where the player goes, a wide bar
 * for the title, a narrow one for the meta line, and a row for the channel. It
 * reserves what is coming, so the page does not jump when the video lands —
 * which matters more here than on a grid, because the thing that would jump is
 * a player somebody is about to press.
 */
export function WatchSkeleton() {
  return (
    <div aria-hidden="true" className="animate-pulse">
      <div className="aspect-video w-full rounded-mo bg-mo-raised" />
      <div className="mt-4 h-5 w-4/5 rounded bg-mo-raised" />
      <div className="mt-2 h-3.5 w-2/5 rounded bg-mo-raised" />
      <div className="mt-5 flex items-center gap-3">
        <div className="h-10 w-10 rounded-mo-pill bg-mo-raised" />
        <div className="h-3.5 w-1/3 rounded bg-mo-raised" />
      </div>
    </div>
  )
}

export function WatchError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert">
      <Card>
        <AlertTriangle aria-hidden="true" className="mx-auto h-8 w-8 text-mo-warn" />
        <Title>This video could not be loaded</Title>
        <Body>{message}</Body>
        {onRetry && (
          <button type="button" onClick={onRetry} className={ACTION}>
            Try again
          </button>
        )}
      </Card>
    </div>
  )
}

/**
 * The id is well-formed and the search finished, and it is not here.
 *
 * The wording is careful, and the care is the point. Nothing failed, and this
 * page does not know that the video does not EXIST — only that it is not among
 * the videos ranked for this account, which is also what a private post, a
 * blocked author or a region restriction looks like from here. Saying "this
 * video does not exist" would be inventing a fact about the platform out of a
 * fact about one viewer.
 */
export function WatchMissing() {
  return (
    <Card>
      <Search aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <Title>We could not find that video</Title>
      <Body>
        It is not among the videos ranked for your account. It may be private, from someone you
        cannot see, or no longer published.
      </Body>
      <BackToTube />
    </Card>
  )
}

export function WatchSignedOut() {
  return (
    <Card>
      <Tv aria-hidden="true" className="mx-auto h-8 w-8 text-mo-purple" />
      <Title>Sign in to watch</Title>
      <Body>Videos are ranked for your account, so {BRAND.name} needs to know who you are.</Body>
      <a href={signInHref(ZONE)} className={ACTION}>
        Sign in
      </a>
    </Card>
  )
}

/**
 * The post is real and on this page; the picture is what is missing.
 *
 * Three causes, and the page says which, because the answer differs: a
 * transcode still running will finish on its own, moderation is somebody
 * else's decision, and a row with no media at all is neither — it is a post
 * whose upload never attached, and waiting will not help. Two of the six long
 * videos the dev stack returns are the third kind.
 *
 * It is drawn IN THE PLAYER'S BOX, at the player's size, so the rest of the
 * page — title, channel, description, the action row — is still there and
 * still works. Somebody can still like a video they cannot watch, which is odd
 * only until you consider the alternative: replacing the whole page with an
 * apology for a post that is otherwise perfectly readable.
 */
export function NoPicture({
  reason,
}: {
  reason: "processing" | "moderation" | "missing"
}) {
  const words = {
    processing: "This video is still being processed. It will play once that finishes.",
    moderation: "This video is waiting on a review before it can be played.",
    missing: "There is no video attached to this post.",
  }[reason]

  return (
    <div
      role="status"
      className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-mo bg-mo-sunken px-6 text-center"
    >
      <VideoOff aria-hidden="true" className="h-8 w-8 text-mo-body" />
      <p className="max-w-sm text-sm text-mo-body">{words}</p>
    </div>
  )
}
