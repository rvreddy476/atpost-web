/**
 * The operating system's media controls — the lock screen, the headset button,
 * the notification with a play button on it, the keyboard's media keys.
 *
 * ── READ THIS BEFORE PROMISING ANYTHING ───────────────────────────────────
 * This does NOT give the web app background audio. A browser tab is throttled
 * the moment it stops being visible and is suspended outright when the phone
 * locks, so the audio stops whatever this file says. What the Media Session API
 * buys is that WHILE something is playing, the OS knows what it is: the lock
 * screen shows the right title, artist and artwork instead of "localhost", and
 * the hardware buttons reach the right element instead of nothing.
 *
 * That is a real feature and it is not the other one. A native app keeps
 * playing with the screen off because it holds an OS audio session; a web page
 * cannot ask for one. If someone needs music that survives a screen lock, the
 * answer is the Android/iOS client, not another pass over this file.
 *
 * ── One owner, enforced here ──────────────────────────────────────────────
 * `navigator.mediaSession` is a singleton per document, and a feed mounts
 * twenty players. If each one set metadata, the lock screen would show whichever
 * component happened to mount last — not the one playing. So this module holds
 * the ownership registry, and every write goes through a function that takes a
 * claim and silently drops the write if that claim is no longer the owner.
 *
 * The registry is a module-level variable rather than React context on purpose:
 * the thing it guards is as global as the document, so a per-provider scope
 * would let two feeds (a feed under a modal, say) each believe they own it.
 *
 * ── Every call is guarded on its own ──────────────────────────────────────
 * `navigator.mediaSession` is absent in some browsers, and `setActionHandler`
 * throws a TypeError for an action the browser does not implement — Firefox
 * has no `seekto`, older WebKit has no `seekforward`. One try/catch around the
 * whole registration block would mean the first unsupported action silently
 * discards every action after it, so each one is wrapped separately.
 *
 * `setPositionState` throws too, and for inputs that happen constantly rather
 * than rarely: `duration` is NaN until HLS has parsed a manifest, and
 * `currentTime` can land a few milliseconds past `duration` at the end of a
 * stream. `safePositionState` is the filter for that, and it returns null
 * rather than a fudged number — an OS scrubber showing nothing is honest, one
 * showing the wrong position is not.
 */

import type { FeedItem, FeedMedia } from "@atpost/types/feed"

/* ── The shape a caller passes in ──────────────────────────────────────────
 *
 * Deliberately not `MediaMetadataInit`: this package must stay renderable in a
 * test and on a server, and naming the DOM type in a prop would drag lib.dom
 * into the contract. It is structurally the same thing.
 */

export interface MediaArtwork {
  src: string
  /** "WIDTHxHEIGHT". Omitted when the real size is not known — see `artworkFor`. */
  sizes?: string
  type?: string
}

export interface MediaSessionMetadataInit {
  title: string
  artist?: string
  album?: string
  artwork?: MediaArtwork[]
}

/**
 * Metadata plus the id that owns it.
 *
 * The id is what makes "exactly one owner, and it is the one the coordinator
 * chose" a checkable statement rather than a hope: `mediaSessionOwnerId()` can
 * be compared against `coordinator.activeId` directly, in a test or in devtools.
 */
export interface MediaSessionInfo extends MediaSessionMetadataInit {
  id: string
}

/* ── Reaching the API at all ───────────────────────────────────────────────── */

/**
 * `navigator.mediaSession` is typed as always-present by lib.dom and is not.
 * The cast is the point of the function: nothing else in this package should
 * have to remember that.
 */
function mediaSession(): MediaSession | null {
  if (typeof navigator === "undefined") return null
  const ms = (navigator as Navigator & { mediaSession?: MediaSession }).mediaSession
  return ms ?? null
}

export function hasMediaSession(): boolean {
  return mediaSession() !== null
}

/**
 * Every action this module ever registers.
 *
 * It is a list rather than an ad-hoc set of calls because releasing ownership
 * has to un-register exactly what claiming registered — a handler left behind
 * on a released session is a play button that starts a video that scrolled off
 * screen ten minutes ago.
 */
const MANAGED_ACTIONS = [
  "play",
  "pause",
  "seekto",
  "seekbackward",
  "seekforward",
  "previoustrack",
  "nexttrack",
] as const

export type ManagedAction = (typeof MANAGED_ACTIONS)[number]

/* ── Ownership ─────────────────────────────────────────────────────────────── */

/**
 * A claim is compared by IDENTITY, not by id. Two mounts of the same post — a
 * card scrolled away and back — produce two claims, and the older one must not
 * be able to tear down the newer one's session on its way out.
 */
export interface MediaSessionClaim {
  readonly ownerId: string
}

let holder: MediaSessionClaim | null = null

export function createMediaSessionClaim(ownerId: string): MediaSessionClaim {
  return { ownerId }
}

/**
 * Take the session. PREEMPTIVE, and that is the safe direction.
 *
 * React runs every effect cleanup in a commit before it runs any effect body,
 * so the item losing `active` releases before the item gaining it claims, and
 * a preemption should never actually happen. But if it ever did — a bug in a
 * consumer, two coordinators, a surface that decided for itself — the outcome
 * that matters is that there is still exactly ONE owner, and that it is the
 * most recent claimant. A refusing `claim` would instead leave the lock screen
 * pinned to a stale item with nothing able to correct it.
 */
export function claimMediaSession(claim: MediaSessionClaim): void {
  if (holder && holder !== claim && process.env.NODE_ENV !== "production") {
    // Not fatal, but it means the ordering assumption above did not hold and
    // something released late (or never). Worth a line, because the visible
    // symptom otherwise is only "the lock screen names the wrong post".
    console.warn(
      `[player] media session preempted: ${holder.ownerId} -> ${claim.ownerId} (previous owner did not release)`
    )
  }
  holder = claim
}

export function holdsMediaSession(claim: MediaSessionClaim | null): boolean {
  return claim !== null && holder === claim
}

/** Who owns it, for a test or a devtools poke. Null when nobody does. */
export function mediaSessionOwnerId(): string | null {
  return holder?.ownerId ?? null
}

/**
 * Hand the session back, and leave nothing behind.
 *
 * The identity check is the whole point: a component that lost the session to
 * a newer claimant still runs its own cleanup, and without this it would wipe
 * the metadata the new owner has just written. That is the "scroll fast and
 * the lock screen goes blank" bug, and it only appears under a fast scroll,
 * which is the hardest place to notice it.
 */
export function releaseMediaSession(claim: MediaSessionClaim): boolean {
  if (holder !== claim) return false
  holder = null

  const ms = mediaSession()
  if (!ms) return true

  // Order matters a little: drop the handlers first, so a button pressed
  // during teardown cannot reach an element that is about to be unmounted.
  for (const action of MANAGED_ACTIONS) {
    try {
      ms.setActionHandler(action, null)
    } catch {
      // Unsupported action. It was never registered, so there is nothing to
      // clear and nothing to report.
    }
  }
  try {
    ms.metadata = null
  } catch {
    /* ignore */
  }
  try {
    ms.playbackState = "none"
  } catch {
    /* ignore */
  }
  try {
    ms.setPositionState()
  } catch {
    /* ignore */
  }
  return true
}

/* ── Writes, all of them ownership-checked and individually guarded ────────── */

export function applyMetadata(claim: MediaSessionClaim, info: MediaSessionMetadataInit): boolean {
  if (!holdsMediaSession(claim)) return false
  const ms = mediaSession()
  if (!ms) return false
  // Present with `mediaSession` everywhere in practice, but they are separate
  // interfaces and a polyfill can supply one without the other.
  if (typeof MediaMetadata === "undefined") return false
  try {
    ms.metadata = new MediaMetadata({
      title: info.title,
      artist: info.artist,
      album: info.album,
      artwork: info.artwork,
    })
    return true
  } catch {
    return false
  }
}

export function applyPlaybackState(
  claim: MediaSessionClaim,
  state: MediaSessionPlaybackState
): boolean {
  if (!holdsMediaSession(claim)) return false
  const ms = mediaSession()
  if (!ms) return false
  try {
    ms.playbackState = state
    return true
  } catch {
    return false
  }
}

/**
 * Register one handler. One try/catch, for one action — see the header note.
 * Returns whether the browser accepted it, which is the only way to find out.
 */
export function applyActionHandler(
  claim: MediaSessionClaim,
  action: ManagedAction,
  handler: MediaSessionActionHandler | null
): boolean {
  if (!holdsMediaSession(claim)) return false
  const ms = mediaSession()
  if (!ms) return false
  try {
    ms.setActionHandler(action, handler)
    return true
  } catch {
    // The browser does not implement this action. Everything else still gets
    // registered, which is exactly what a single shared try/catch would lose.
    return false
  }
}

export interface PositionState {
  duration: number
  position: number
  playbackRate: number
}

/**
 * Turn whatever the element currently believes into something the browser will
 * accept, or into null.
 *
 * The rejections are not defensive programming, they are the normal states of
 * an HLS element:
 *   · `duration` is NaN from mount until the manifest is parsed, which for a
 *     feed video is most of its life — every card that never gets played sits
 *     there for ever.
 *   · `duration` is Infinity for a live stream. The spec permits it; a scrubber
 *     cannot express it, so this returns null and the OS shows no scrubber,
 *     which is the truth.
 *   · `position` overshooting `duration` by a frame at the end of a stream is
 *     routine, and `setPositionState` throws a TypeError for it.
 *   · `playbackRate` of 0 throws. The element reports 0 in a few transient
 *     states, so it is normalised rather than passed through.
 */
export function safePositionState(
  duration: number,
  position: number,
  playbackRate: number
): PositionState | null {
  if (!Number.isFinite(duration) || duration <= 0) return null

  const rate = Number.isFinite(playbackRate) && playbackRate > 0 ? playbackRate : 1
  const raw = Number.isFinite(position) ? position : 0
  const clamped = Math.min(Math.max(raw, 0), duration)

  return { duration, position: clamped, playbackRate: rate }
}

/**
 * Publish a position, or clear it.
 *
 * A null state CLEARS rather than skips. Leaving the last good numbers in place
 * when the element no longer has any — a source swapped, a stream that went
 * live — would leave the OS extrapolating a position forward from a video that
 * is not there any more.
 */
export function applyPositionState(
  claim: MediaSessionClaim,
  state: PositionState | null
): boolean {
  if (!holdsMediaSession(claim)) return false
  const ms = mediaSession()
  if (!ms) return false
  try {
    if (state === null) {
      ms.setPositionState()
    } else {
      ms.setPositionState(state)
    }
    return true
  } catch {
    return false
  }
}

/* ── Deciding when a re-apply is actually needed ───────────────────────────── */

/**
 * A cheap value identity for a metadata object.
 *
 * The feed rebuilds an item object on every like, save and repost, so the
 * metadata object handed to the player gets a new identity several times a
 * minute while nothing about it changes. Depending on the OBJECT in an effect
 * would re-claim the session and rebuild every action handler each time — the
 * same class of mistake as the callbacks-in-deps bugs documented in
 * MomentumVideo, and with the same shape of symptom: churn nothing reports.
 *
 * So effects depend on this string instead, and read the object from a ref.
 *
 * The artwork URLs ARE part of the key, signature and all, and that is wanted.
 * A feed refresh re-signs them — the gateway's are good for 300 seconds — and
 * the old ones stop working, so the session genuinely has to be re-described
 * at that moment or the lock screen keeps an artwork URL the OS can no longer
 * fetch. Verified on the live feed: one re-claim per refresh, and none at all
 * for a like, a save or a mute toggle.
 */
export function metadataKey(info: MediaSessionMetadataInit | null | undefined): string {
  if (!info) return ""
  const art = (info.artwork ?? []).map((a) => a.src).join(",")
  return [info.title, info.artist ?? "", info.album ?? "", art].join(" ")
}

/* ── Building metadata from a post ─────────────────────────────────────────── */

/**
 * The variant ladder, and which rungs are PICTURES.
 *
 * This is the trap that `pickProgressive` and `pickImage` each document from
 * their own side, and artwork is where it bites hardest. A video's variants are
 * `360p / 480p / 720p / original` — all of them MP4 files — plus a single
 * `thumb_150` that is an image. Handing `variants["480p"]` to the lock screen
 * as artwork produces a silently blank tile, because the OS fetches it, finds
 * `video/mp4`, and gives up without telling anybody.
 *
 * Verified against the live gateway rather than assumed:
 *   thumb_150   150x150 image/jpeg, SQUARE — a 1080x1920 flick's thumb is
 *               150x150, not 84x150, so its size is fixed rather than derived.
 *   small_480   long edge 480, aspect preserved (1080x1350 -> 384x480)
 *   medium_1080 long edge 1080, aspect preserved (1080x1350 -> 864x1080)
 *   original    the uploaded file at its declared width/height — an image for
 *               an image, and the SOURCE VIDEO for a video, which is why it is
 *               only ever offered for `kind === "image"`.
 */
interface ArtworkRung {
  name: string
  edge: number
  /** True when the variant is centre-cropped to a square at `edge`. */
  square: boolean
}

const ARTWORK_LADDER: readonly ArtworkRung[] = [
  { name: "thumb_150", edge: 150, square: true },
  { name: "small_480", edge: 480, square: false },
  { name: "medium_1080", edge: 1080, square: false },
]

/** What a long-edge resize of `edge` produces, or undefined if we cannot say. */
function longEdgeSizes(
  media: Pick<FeedMedia, "width" | "height">,
  edge: number
): string | undefined {
  const w = media.width ?? 0
  const h = media.height ?? 0
  // No declared dimensions: omit `sizes` rather than invent one. It is a hint
  // the OS uses to choose between entries, and a wrong hint is worse than none.
  if (w <= 0 || h <= 0) return undefined
  const longest = Math.max(w, h)
  // The ladder never upscales, so a small original comes back at its own size.
  if (longest <= edge) return `${w}x${h}`
  const scale = edge / longest
  return `${Math.round(w * scale)}x${Math.round(h * scale)}`
}

/**
 * Artwork for the lock screen, smallest first, every size that exists.
 *
 * More than one entry on purpose: the OS picks from the list by its own display
 * size, and a phone lock screen, a desktop notification and a car head unit
 * want very different pixels. Giving it only the 1080 makes a watch download a
 * megabyte for a 40px tile.
 *
 * `type` is deliberately not set. It is a hint for choosing between entries,
 * the ladder is already unambiguous by size, and these URLs carry no file
 * extension to infer one from — the media host serves `.../thumb_150` with the
 * MIME type in the response header, so the OS learns it by fetching anyway.
 */
export function artworkFor(media: FeedMedia): MediaArtwork[] {
  const variants = media.variants
  if (!variants) return []

  const out: MediaArtwork[] = []
  for (const rung of ARTWORK_LADDER) {
    const src = variants[rung.name]
    if (!src) continue
    out.push({
      src,
      sizes: rung.square ? `${rung.edge}x${rung.edge}` : longEdgeSizes(media, rung.edge),
    })
  }

  // See the ladder note: `original` is the source video on a video row.
  if (media.kind === "image" && variants.original) {
    const w = media.width ?? 0
    const h = media.height ?? 0
    out.push({
      src: variants.original,
      sizes: w > 0 && h > 0 ? `${w}x${h}` : undefined,
    })
  }

  return out
}

/**
 * A lock screen shows one line. A post's text is a paragraph.
 *
 * First line, trimmed, capped — not because the OS cannot truncate, but
 * because it truncates at whatever width the device has and a title whose
 * first 200 characters are a URL tells the person nothing.
 */
const TITLE_MAX = 120

function oneLine(value: string | undefined): string {
  if (!value) return ""
  const first = value.split("\n").find((line) => line.trim().length > 0) ?? ""
  const trimmed = first.trim()
  if (trimmed.length <= TITLE_MAX) return trimmed
  return `${trimmed.slice(0, TITLE_MAX - 1).trimEnd()}…`
}

/**
 * What the OS should say this post is.
 *
 * ── Title ─────────────────────────────────────────────────────────────────
 * The post's own `title` when it has one — a long_video's title is a headline,
 * not a caption. Otherwise the media's alt text (written by the author to
 * describe this exact video), then the post body, then a bare "Video". The
 * fallback chain never composes a sentence of its own: everything here is
 * something the author actually wrote.
 *
 * ── Artist ────────────────────────────────────────────────────────────────
 * The author's display name. Note this is the opposite preference to the CARD,
 * which shows `channel.name` first — deliberately. A card is showing you where
 * something was published; a lock screen is answering "who is this", and the
 * channel then has somewhere else to go: `album`, the third line, and only when
 * it is not simply repeating the artist.
 */
export function metadataForPost(item: FeedItem, media: FeedMedia): MediaSessionInfo {
  const title =
    oneLine(item.title) || oneLine(media.alt_text) || oneLine(item.text) || "Video"

  const author = item.author?.display_name?.trim()
  const channel = item.channel?.name?.trim()
  const artist = author || channel || undefined
  const album = channel && channel !== artist ? channel : undefined

  return {
    id: item.id,
    title,
    artist,
    album,
    artwork: artworkFor(media),
  }
}
