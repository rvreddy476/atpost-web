"use client"

/**
 * The picture or the video, and the four states that are not either.
 *
 * The rule this file exists to hold: NOTHING renders as a broken player. There
 * are four distinct reasons a post can have media and still not show it, they
 * mean different things to the person reading, and collapsing them into one
 * grey box would tell nobody anything:
 *
 *   is_processing        the video is still transcoding. Temporary, the
 *                        author's own upload, and it WILL appear — so it says
 *                        so, over the blurhash, which already exists.
 *   moderation pending   nothing has reviewed it. Not the viewer's business
 *                        to be told the details, but it must not autoplay.
 *   signed URL expired   ours to fix, not the viewer's to understand: the card
 *                        asks the zone for a fresh page rather than showing a
 *                        broken image icon.
 *   failed transcode     it is not coming. Say so once and stop.
 *
 * ── Why a plain <img> and not next/image ──────────────────────────────────
 * The variants are already the right size for this card — the server produced
 * medium_1080 for exactly this — so an optimizer has nothing to optimise. What
 * it WOULD do is fetch and cache the URL server-side, and these URLs carry a
 * 300-second signature: the cached copy outlives the credential inside it, so
 * the optimizer serves a picture it can no longer re-fetch and eventually
 * serves an error. Signed, short-lived, already-sized URLs are the case
 * next/image is wrong for.
 */

import { useMemo, useState } from "react"
import type { FeedItem, FeedMedia } from "@atpost/types/feed"
import {
  MomentumVideo,
  isModerationCleared,
  isTranscodeReady,
  pickPoster,
  pickProgressive,
  type WatchEvent,
  type WatchSessionInfo,
} from "@momentum/player"
import { BlurhashCanvas } from "./BlurhashCanvas"
import { aspectRatio, isExpired, pickImage } from "./variants"

export interface PostMediaProps {
  item: FeedItem
  media: FeedMedia
  /** From the coordinator. Exactly one card in the feed may be true. */
  active: boolean
  muted: boolean
  onToggleMuted?: () => void
  session?: WatchSessionInfo
  onWatchEvent?: (event: WatchEvent) => void
  /** "This post's URLs have gone stale" — the zone refetches the page. */
  onStale?: (postId: string) => void
  /**
   * Playlist url resolution, owned by the zone. Passed straight through to
   * the player — see the pLoader note there for why a feed under a basePath
   * cannot play HLS without it.
   */
  resolveUrl?: (url: string) => string
}

/**
 * `max-h-[75vh]` is not styling — it is what makes autoplay possible.
 *
 * A 9:16 flick in a 570px column wants to be about 1000px tall, which is more
 * than a laptop viewport. A card that cannot fit on screen can never be "the
 * item most in view", and it also means scrolling past one post is three
 * flicks of the wheel. Capping the height keeps a portrait video large without
 * letting it own more than the screen; the video inside is `object-contain`,
 * so nothing is cropped, it is only bounded.
 */
const FRAME = "relative mx-auto w-full max-h-[75vh] overflow-hidden rounded-mo bg-mo-sunken"

/** A short line over the blurhash. Body colour: this is small text. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-4">
      <p className="rounded-mo-sm bg-mo-bg/80 px-3 py-1.5 text-center text-sm text-mo-body backdrop-blur-sm">
        {children}
      </p>
    </div>
  )
}

export function PostMedia({
  item,
  media,
  active,
  muted,
  onToggleMuted,
  session,
  onWatchEvent,
  onStale,
  resolveUrl,
}: PostMediaProps) {
  const [imageFailed, setImageFailed] = useState(false)
  const ratio = aspectRatio(media)
  const expired = isExpired(media)

  const source = useMemo(
    () => ({
      hlsUrl: media.playback_kind === "hls" ? media.playback_url ?? media.hls_url : undefined,
      // Only offered as a fallback, and only while it is still signed.
      progressiveUrl: expired ? undefined : pickProgressive(media),
      posterUrl: expired ? undefined : pickPoster(media),
      durationMs: media.duration_ms,
      width: media.width,
      height: media.height,
    }),
    [media, expired]
  )

  const frame = (children: React.ReactNode) => (
    <div className={FRAME} style={{ aspectRatio: ratio }}>
      <BlurhashCanvas hash={media.blurhash} />
      {children}
    </div>
  )

  /* ── Not showable ─────────────────────────────────────────────────────── */

  // Checked before transcode state: a post can be `is_processing` while its
  // media row still says "ready", and the post is the more recent truth.
  if (item.is_processing) {
    return frame(<Notice>Still processing — this will play shortly.</Notice>)
  }

  if (media.status === "failed" || media.processing_status === "failed") {
    return frame(<Notice>This media could not be processed.</Notice>)
  }

  if (!isTranscodeReady(media)) {
    return frame(<Notice>Still processing — this will play shortly.</Notice>)
  }

  if (!isModerationCleared(media)) {
    // Deliberately vague. "Rejected by moderation" on someone else's post
    // discloses a moderation outcome to a stranger.
    return frame(<Notice>This media is not available.</Notice>)
  }

  if (expired) {
    // Our problem, not theirs. The blurhash stays up and the zone is told.
    onStale?.(item.id)
    return frame(<Notice>Refreshing…</Notice>)
  }

  /* ── Video ────────────────────────────────────────────────────────────── */

  if (media.kind === "video") {
    return (
      <div className={FRAME} style={{ aspectRatio: ratio }}>
        <BlurhashCanvas hash={media.blurhash} />
        <MomentumVideo
          source={source}
          active={active}
          muted={muted}
          // A flick is short and loops the way the phone app loops it; a long
          // video that restarted itself forever would be a trap.
          loop={item.content_type === "flick"}
          className="absolute inset-0"
          ariaLabel={media.alt_text || item.text || "Video"}
          session={session}
          onWatchEvent={onWatchEvent}
          onToggleMuted={onToggleMuted}
          onUnplayable={() => onStale?.(item.id)}
          resolveUrl={resolveUrl}
        />
      </div>
    )
  }

  /* ── Image ────────────────────────────────────────────────────────────── */

  const src = pickImage(media)
  if (!src || imageFailed) {
    return frame(imageFailed ? <Notice>This image could not be loaded.</Notice> : null)
  }

  return frame(
    // eslint-disable-next-line @next/next/no-img-element -- see the header note.
    <img
      src={src}
      // An author who marked a picture decorative said it carries no
      // information, and an empty alt is how that is expressed. Anything else
      // — including falling back to the post's text — would put a caption in
      // front of a screen reader that the author chose not to write.
      alt={media.alt_decorative ? "" : media.alt_text || ""}
      loading="lazy"
      decoding="async"
      width={media.width}
      height={media.height}
      className="absolute inset-0 h-full w-full object-cover"
      onError={() => {
        // The commonest cause is a signature that expired between the fetch
        // and the paint, so ask for a fresh page before giving up on it.
        if (!expired) onStale?.(item.id)
        setImageFailed(true)
      }}
    />
  )
}
