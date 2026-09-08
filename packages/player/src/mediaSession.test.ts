import { afterEach, beforeEach, describe, expect, it } from "vitest"
import type { FeedItem, FeedMedia } from "@atpost/types/feed"
import {
  applyActionHandler,
  applyMetadata,
  applyPlaybackState,
  applyPositionState,
  artworkFor,
  claimMediaSession,
  createMediaSessionClaim,
  hasMediaSession,
  holdsMediaSession,
  mediaSessionOwnerId,
  metadataForPost,
  metadataKey,
  releaseMediaSession,
  safePositionState,
} from "./mediaSession"

/* ── A media session that records instead of doing anything ────────────────
 *
 * Also the only way to test the guards: the interesting cases are "the browser
 * does not have this API" and "the browser throws for this one action", and
 * neither is reachable without being able to build a hostile one.
 */

interface FakeSession {
  metadata: unknown
  playbackState: string
  positions: (unknown | undefined)[]
  handlers: Map<string, unknown>
  /** Actions whose `setActionHandler` throws, the way a real browser does. */
  unsupported: Set<string>
}

let originalNavigator: PropertyDescriptor | undefined
let originalMetadataCtor: PropertyDescriptor | undefined
let warnings: string[] = []
let originalWarn: typeof console.warn

function installSession(unsupported: string[] = []): FakeSession {
  const fake: FakeSession = {
    metadata: null,
    playbackState: "none",
    positions: [],
    handlers: new Map(),
    unsupported: new Set(unsupported),
  }

  const mediaSession = {
    get metadata() {
      return fake.metadata
    },
    set metadata(value: unknown) {
      fake.metadata = value
    },
    get playbackState() {
      return fake.playbackState
    },
    set playbackState(value: string) {
      fake.playbackState = value
    },
    setActionHandler(action: string, handler: unknown) {
      if (fake.unsupported.has(action)) {
        // Exactly what Chrome and Firefox do for an action they do not
        // implement: a TypeError, not a silent no-op.
        throw new TypeError(`Unsupported action: ${action}`)
      }
      if (handler === null) fake.handlers.delete(action)
      else fake.handlers.set(action, handler)
    },
    setPositionState(state?: unknown) {
      fake.positions.push(state)
    },
  }

  Object.defineProperty(globalThis, "navigator", {
    value: { mediaSession },
    configurable: true,
    writable: true,
  })

  class FakeMediaMetadata {
    title: string
    artist: string
    album: string
    artwork: unknown[]
    constructor(init: Record<string, unknown> = {}) {
      this.title = (init.title as string) ?? ""
      this.artist = (init.artist as string) ?? ""
      this.album = (init.album as string) ?? ""
      this.artwork = (init.artwork as unknown[]) ?? []
    }
  }
  Object.defineProperty(globalThis, "MediaMetadata", {
    value: FakeMediaMetadata,
    configurable: true,
    writable: true,
  })

  return fake
}

/** A browser with no Media Session API at all. */
function installNothing() {
  Object.defineProperty(globalThis, "navigator", {
    value: {},
    configurable: true,
    writable: true,
  })
}

beforeEach(() => {
  originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator")
  originalMetadataCtor = Object.getOwnPropertyDescriptor(globalThis, "MediaMetadata")
  warnings = []
  originalWarn = console.warn
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "))
  }
})

afterEach(() => {
  // Whatever a test did, hand the session back so the module-level registry
  // does not leak into the next one.
  const owner = mediaSessionOwnerId()
  if (owner !== null) {
    // Claim it, then release it — the only way back to "nobody owns this"
    // from outside, and it exercises the preemption path on purpose.
    const reclaim = createMediaSessionClaim("__cleanup__")
    claimMediaSession(reclaim)
    releaseMediaSession(reclaim)
  }

  console.warn = originalWarn
  if (originalNavigator) Object.defineProperty(globalThis, "navigator", originalNavigator)
  else delete (globalThis as Record<string, unknown>).navigator
  if (originalMetadataCtor)
    Object.defineProperty(globalThis, "MediaMetadata", originalMetadataCtor)
  else delete (globalThis as Record<string, unknown>).MediaMetadata
})

/* ── Ownership ─────────────────────────────────────────────────────────────
 *
 * This is the rule the whole feature rests on. A feed mounts twenty players
 * and `navigator.mediaSession` is one object, so "the OS describes the item
 * that is playing" is true only if exactly one of them is ever allowed to
 * write.
 */

describe("ownership", () => {
  it("starts unowned", () => {
    expect(mediaSessionOwnerId()).toBe(null)
  })

  it("names the claimant, and only the claimant holds it", () => {
    installSession()
    const a = createMediaSessionClaim("post-a")
    const b = createMediaSessionClaim("post-b")
    claimMediaSession(a)

    expect(mediaSessionOwnerId()).toBe("post-a")
    expect(holdsMediaSession(a)).toBe(true)
    expect(holdsMediaSession(b)).toBe(false)
    expect(holdsMediaSession(null)).toBe(false)
  })

  it("keeps exactly one owner when several players claim, and it is the last", () => {
    installSession()
    const claims = ["a", "b", "c", "d"].map((id) => createMediaSessionClaim(id))
    for (const claim of claims) claimMediaSession(claim)

    expect(claims.filter((c) => holdsMediaSession(c))).toHaveLength(1)
    expect(mediaSessionOwnerId()).toBe("d")
  })

  it("warns when it preempts a live owner, because that means someone released late", () => {
    installSession()
    claimMediaSession(createMediaSessionClaim("a"))
    claimMediaSession(createMediaSessionClaim("b"))

    expect(warnings.join("\n")).toContain("media session preempted: a -> b")
  })

  it("a preempted claim's late release does NOT wipe the live owner", () => {
    // The bug this prevents only shows up under a fast scroll: the card that
    // lost the session runs its own cleanup, and without the identity check it
    // blanks the lock screen the new card has just filled in.
    const fake = installSession()
    const a = createMediaSessionClaim("post-a")
    const b = createMediaSessionClaim("post-b")

    claimMediaSession(a)
    applyMetadata(a, { title: "A" })
    claimMediaSession(b)
    applyMetadata(b, { title: "B" })

    expect(releaseMediaSession(a)).toBe(false)
    expect(mediaSessionOwnerId()).toBe("post-b")
    expect((fake.metadata as { title: string }).title).toBe("B")
  })

  it("two mounts of the SAME id are distinct claims", () => {
    // A card scrolled away and back is the same post and a different claim.
    // Comparing by id rather than identity would let the first mount's cleanup
    // kill the second mount's session.
    installSession()
    const first = createMediaSessionClaim("post-a")
    const second = createMediaSessionClaim("post-a")

    claimMediaSession(first)
    claimMediaSession(second)

    expect(releaseMediaSession(first)).toBe(false)
    expect(mediaSessionOwnerId()).toBe("post-a")
    expect(holdsMediaSession(second)).toBe(true)
  })

  it("releasing leaves nothing behind", () => {
    const fake = installSession()
    const a = createMediaSessionClaim("post-a")
    claimMediaSession(a)
    applyMetadata(a, { title: "A" })
    applyPlaybackState(a, "playing")
    applyActionHandler(a, "play", () => {})
    applyActionHandler(a, "seekto", () => {})
    applyPositionState(a, { duration: 10, position: 1, playbackRate: 1 })

    expect(fake.handlers.size).toBe(2)
    expect(releaseMediaSession(a)).toBe(true)

    expect(mediaSessionOwnerId()).toBe(null)
    expect(fake.metadata).toBe(null)
    expect(fake.playbackState).toBe("none")
    // A handler left behind is a play button that starts a video which
    // scrolled off screen ten minutes ago.
    expect(fake.handlers.size).toBe(0)
    // Cleared, not merely stopped being updated.
    expect(fake.positions[fake.positions.length - 1]).toBe(undefined)
  })

  it("a non-owner cannot write anything", () => {
    const fake = installSession()
    const a = createMediaSessionClaim("post-a")
    const b = createMediaSessionClaim("post-b")
    claimMediaSession(a)

    expect(applyMetadata(b, { title: "B" })).toBe(false)
    expect(applyPlaybackState(b, "playing")).toBe(false)
    expect(applyActionHandler(b, "play", () => {})).toBe(false)
    expect(applyPositionState(b, { duration: 5, position: 1, playbackRate: 1 })).toBe(false)

    expect(fake.metadata).toBe(null)
    expect(fake.playbackState).toBe("none")
    expect(fake.handlers.size).toBe(0)
    expect(fake.positions).toHaveLength(0)
  })
})

/* ── The ordering React actually produces ──────────────────────────────────
 *
 * React runs every effect CLEANUP in a commit before it runs any effect BODY,
 * in fiber order. That is what makes the feed's hand-off safe: the card losing
 * `active` releases before the card gaining it claims. This drives the registry
 * through exactly that sequence for a feed of players, so the invariant is
 * checked against the real call order rather than against a convenient one.
 */

interface FakePlayer {
  id: string
  claim: ReturnType<typeof createMediaSessionClaim> | null
  active: boolean
}

function commit(players: FakePlayer[], activeId: string | null) {
  const next = players.map((p) => ({ player: p, wants: p.id === activeId }))

  // Phase 1 — cleanups, for every effect whose deps changed.
  for (const { player, wants } of next) {
    if (player.claim && (!wants || player.active !== wants)) {
      releaseMediaSession(player.claim)
      player.claim = null
    }
  }
  // Phase 2 — effect bodies.
  for (const { player, wants } of next) {
    player.active = wants
    if (wants && !player.claim) {
      const claim = createMediaSessionClaim(player.id)
      player.claim = claim
      claimMediaSession(claim)
      applyMetadata(claim, { title: player.id })
    }
  }
}

describe("a feed of players", () => {
  it("ends every commit with exactly one owner, and it is the coordinator's choice", () => {
    const fake = installSession()
    const players: FakePlayer[] = ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      claim: null,
      active: false,
    }))

    // Mount: nothing is centred yet.
    commit(players, null)
    expect(mediaSessionOwnerId()).toBe(null)

    // Scroll down the feed, one item at a time.
    for (const activeId of ["a", "b", "c", "d", "e", "d", "c"]) {
      commit(players, activeId)
      const holders = players.filter((p) => holdsMediaSession(p.claim))
      expect(holders.map((p) => p.id)).toEqual([activeId])
      expect(mediaSessionOwnerId()).toBe(activeId)
      expect((fake.metadata as { title: string }).title).toBe(activeId)
    }

    // Nothing ever had to preempt a live owner.
    expect(warnings).toEqual([])

    // Scrolled past the end of the videos — the session goes with it.
    commit(players, null)
    expect(mediaSessionOwnerId()).toBe(null)
    expect(fake.metadata).toBe(null)
  })

  it("hands the session back when the active card unmounts", () => {
    const fake = installSession()
    const players: FakePlayer[] = [{ id: "a", claim: null, active: false }]
    commit(players, "a")
    expect(mediaSessionOwnerId()).toBe("a")

    // Unmount is just the cleanup with no matching body.
    releaseMediaSession(players[0].claim!)
    expect(mediaSessionOwnerId()).toBe(null)
    expect(fake.metadata).toBe(null)
  })
})

/* ── Guards ────────────────────────────────────────────────────────────────
 *
 * Two failure modes, and they fail differently: a browser with no
 * `navigator.mediaSession` at all, and a browser that has one but throws for
 * an action it does not implement.
 */

describe("guards", () => {
  it("does nothing, and throws nothing, with no navigator.mediaSession", () => {
    installNothing()
    expect(hasMediaSession()).toBe(false)

    const a = createMediaSessionClaim("post-a")
    claimMediaSession(a)

    expect(applyMetadata(a, { title: "A" })).toBe(false)
    expect(applyPlaybackState(a, "playing")).toBe(false)
    expect(applyActionHandler(a, "play", () => {})).toBe(false)
    expect(applyPositionState(a, { duration: 5, position: 1, playbackRate: 1 })).toBe(false)
    // Release must still surrender ownership even with nothing to clear.
    expect(releaseMediaSession(a)).toBe(true)
    expect(mediaSessionOwnerId()).toBe(null)
  })

  it("survives navigator being absent entirely (a server render)", () => {
    delete (globalThis as Record<string, unknown>).navigator
    expect(hasMediaSession()).toBe(false)
    const a = createMediaSessionClaim("post-a")
    claimMediaSession(a)
    expect(applyMetadata(a, { title: "A" })).toBe(false)
    expect(releaseMediaSession(a)).toBe(true)
  })

  it("one unsupported action does not take the others down with it", () => {
    // The bug a single try/catch around the whole registration block produces:
    // Firefox has no `seekto`, so everything registered after it is lost and
    // the lock screen's play button stops working for no visible reason.
    const fake = installSession(["seekto", "seekforward"])
    const a = createMediaSessionClaim("post-a")
    claimMediaSession(a)

    expect(applyActionHandler(a, "play", () => {})).toBe(true)
    expect(applyActionHandler(a, "pause", () => {})).toBe(true)
    expect(applyActionHandler(a, "seekto", () => {})).toBe(false)
    expect(applyActionHandler(a, "seekbackward", () => {})).toBe(true)
    expect(applyActionHandler(a, "seekforward", () => {})).toBe(false)

    expect([...fake.handlers.keys()].sort()).toEqual(["pause", "play", "seekbackward"])
  })

  it("releasing a session whose every action throws still clears the rest", () => {
    const fake = installSession(["play", "pause", "seekto", "seekbackward", "seekforward"])
    const a = createMediaSessionClaim("post-a")
    claimMediaSession(a)
    applyMetadata(a, { title: "A" })
    applyPlaybackState(a, "playing")

    expect(releaseMediaSession(a)).toBe(true)
    expect(fake.metadata).toBe(null)
    expect(fake.playbackState).toBe("none")
  })

  it("writes no metadata when the MediaMetadata constructor is missing", () => {
    const fake = installSession()
    delete (globalThis as Record<string, unknown>).MediaMetadata
    const a = createMediaSessionClaim("post-a")
    claimMediaSession(a)

    expect(applyMetadata(a, { title: "A" })).toBe(false)
    expect(fake.metadata).toBe(null)
    // Everything else still works — a missing constructor is not a missing API.
    expect(applyPlaybackState(a, "playing")).toBe(true)
  })
})

/* ── setPositionState, which throws for inputs that happen constantly ─────── */

describe("safePositionState", () => {
  it("refuses a duration that is not yet known", () => {
    // An HLS element reports NaN from mount until the manifest is parsed,
    // which for a feed card that is never played is its whole life.
    expect(safePositionState(NaN, 0, 1)).toBe(null)
  })

  it("refuses a live stream", () => {
    // Infinity is a legal duration and an impossible scrubber. No state is
    // more honest than a bar that can never fill.
    expect(safePositionState(Number.POSITIVE_INFINITY, 12, 1)).toBe(null)
  })

  it("refuses a zero or negative duration", () => {
    expect(safePositionState(0, 0, 1)).toBe(null)
    expect(safePositionState(-4, 0, 1)).toBe(null)
  })

  it("clamps a position past the end instead of throwing", () => {
    // Routine at the end of a stream: currentTime lands a frame beyond
    // duration and setPositionState answers with a TypeError.
    expect(safePositionState(10, 10.004, 1)).toEqual({
      duration: 10,
      position: 10,
      playbackRate: 1,
    })
  })

  it("clamps a negative or unknown position to zero", () => {
    expect(safePositionState(10, -1, 1)?.position).toBe(0)
    expect(safePositionState(10, NaN, 1)?.position).toBe(0)
  })

  it("normalises a playback rate the API would reject", () => {
    expect(safePositionState(10, 1, 0)?.playbackRate).toBe(1)
    expect(safePositionState(10, 1, NaN)?.playbackRate).toBe(1)
    expect(safePositionState(10, 1, -2)?.playbackRate).toBe(1)
    expect(safePositionState(10, 1, 1.5)?.playbackRate).toBe(1.5)
  })

  it("passes an ordinary playhead through untouched", () => {
    expect(safePositionState(221.994, 30.5, 1)).toEqual({
      duration: 221.994,
      position: 30.5,
      playbackRate: 1,
    })
  })

  it("clears the OS scrubber when handed null", () => {
    const fake = installSession()
    const a = createMediaSessionClaim("post-a")
    claimMediaSession(a)
    expect(applyPositionState(a, null)).toBe(true)
    expect(fake.positions).toEqual([undefined])
  })
})

/* ── The key that keeps effects from churning ─────────────────────────────── */

describe("metadataKey", () => {
  it("is the same for a rebuilt but identical object", () => {
    // The feed rebuilds an item on every like and save. If the media session
    // effect depended on the object, each like would re-claim the session and
    // rebuild seven action handlers.
    const a = { title: "T", artist: "A", artwork: [{ src: "u1" }] }
    const b = { title: "T", artist: "A", artwork: [{ src: "u1" }] }
    expect(a).not.toBe(b)
    expect(metadataKey(a)).toBe(metadataKey(b))
  })

  it("changes when the words change", () => {
    const base = { title: "T", artist: "A", artwork: [{ src: "u1" }] }
    expect(metadataKey({ ...base, title: "U" })).not.toBe(metadataKey(base))
    expect(metadataKey({ ...base, artist: "B" })).not.toBe(metadataKey(base))
    expect(metadataKey({ ...base, album: "C" })).not.toBe(metadataKey(base))
    expect(metadataKey({ ...base, artwork: [{ src: "u2" }] })).not.toBe(metadataKey(base))
  })

  it("is empty for nothing at all", () => {
    expect(metadataKey(null)).toBe("")
    expect(metadataKey(undefined)).toBe("")
  })
})

/* ── Artwork ───────────────────────────────────────────────────────────────
 *
 * The sizes below are measured, not assumed: the fixtures match what the live
 * gateway actually returned for a 1080x1350 photograph and a 1080x1920 flick.
 */

const videoMedia = (over: Partial<FeedMedia> = {}): FeedMedia => ({
  media_id: "m1",
  kind: "video",
  position: 0,
  width: 1080,
  height: 1920,
  duration_ms: 28_411,
  variants: {
    "360p": "https://media/360p",
    "480p": "https://media/480p",
    "720p": "https://media/720p",
    original: "https://media/original",
    thumb_150: "https://media/thumb_150",
  },
  ...over,
})

const imageMedia = (over: Partial<FeedMedia> = {}): FeedMedia => ({
  media_id: "m2",
  kind: "image",
  position: 0,
  width: 1080,
  height: 1350,
  variants: {
    thumb_150: "https://media/thumb_150",
    small_480: "https://media/small_480",
    medium_1080: "https://media/medium_1080",
    original: "https://media/original",
  },
  ...over,
})

describe("artworkFor", () => {
  it("never offers a video file as a picture", () => {
    // The whole point. A video's 360p/480p/720p/original are MP4s; handing one
    // to the lock screen produces a blank tile and no error anywhere.
    const art = artworkFor(videoMedia())
    expect(art.map((a) => a.src)).toEqual(["https://media/thumb_150"])
    expect(art[0].sizes).toBe("150x150")
  })

  it("gives an image post every size it has, smallest first", () => {
    // Measured against the live gateway for a 1080x1350 upload: the thumb is a
    // 150x150 square crop, the rest are long-edge resizes.
    expect(artworkFor(imageMedia())).toEqual([
      { src: "https://media/thumb_150", sizes: "150x150" },
      { src: "https://media/small_480", sizes: "384x480" },
      { src: "https://media/medium_1080", sizes: "864x1080" },
      { src: "https://media/original", sizes: "1080x1350" },
    ])
  })

  it("omits a size it cannot work out rather than inventing one", () => {
    const art = artworkFor(imageMedia({ width: undefined, height: undefined }))
    // The square crop is a fixed size whatever the source was.
    expect(art[0]).toEqual({ src: "https://media/thumb_150", sizes: "150x150" })
    expect(art[1].sizes).toBe(undefined)
    expect(art[3].sizes).toBe(undefined)
  })

  it("does not claim the ladder upscales a small original", () => {
    const art = artworkFor(imageMedia({ width: 300, height: 200 }))
    expect(art[1].sizes).toBe("300x200")
    expect(art[2].sizes).toBe("300x200")
  })

  it("is empty when there are no variants", () => {
    expect(artworkFor(videoMedia({ variants: undefined }))).toEqual([])
    expect(artworkFor(videoMedia({ variants: {} }))).toEqual([])
  })

  it("skips rungs the server did not produce", () => {
    const art = artworkFor(
      imageMedia({ variants: { medium_1080: "https://media/medium_1080" } })
    )
    expect(art.map((a) => a.src)).toEqual(["https://media/medium_1080"])
  })
})

/* ── What the OS is told a post is ────────────────────────────────────────── */

const post = (over: Partial<FeedItem> = {}): FeedItem => ({
  id: "post-1",
  author_id: "u1",
  content_type: "flick",
  created_at: "2026-09-08T00:00:00Z",
  counts: { likes: 0, comments: 0 },
  author: { id: "u1", display_name: "raghu varan" },
  ...over,
})

describe("metadataForPost", () => {
  it("carries the id the ownership rule is checked against", () => {
    expect(metadataForPost(post(), videoMedia()).id).toBe("post-1")
  })

  it("prefers the post's own title", () => {
    const info = metadataForPost(post({ title: "Kattu kattu", text: "body" }), videoMedia())
    expect(info.title).toBe("Kattu kattu")
  })

  it("falls back to the author's alt text, then the body, then a bare word", () => {
    expect(metadataForPost(post({ text: "body" }), videoMedia({ alt_text: "alt" })).title).toBe(
      "alt"
    )
    expect(metadataForPost(post({ text: "body" }), videoMedia()).title).toBe("body")
    expect(metadataForPost(post(), videoMedia()).title).toBe("Video")
  })

  it("takes the first line of a paragraph, not the paragraph", () => {
    const info = metadataForPost(post({ text: "\n\nFirst line\nSecond line" }), videoMedia())
    expect(info.title).toBe("First line")
  })

  it("caps a title a lock screen would only mangle", () => {
    const info = metadataForPost(post({ text: "x".repeat(400) }), videoMedia())
    expect(info.title).toHaveLength(120)
    expect(info.title.endsWith("…")).toBe(true)
  })

  it("names the author, and puts the channel on the third line", () => {
    const info = metadataForPost(
      post({
        author: { id: "u1", display_name: "Call UserB" },
        channel: { user_id: "u1", name: "Call B Studio" },
      }),
      videoMedia()
    )
    expect(info.artist).toBe("Call UserB")
    expect(info.album).toBe("Call B Studio")
  })

  it("uses the channel as the artist when there is no author name", () => {
    const info = metadataForPost(
      post({ author: undefined, channel: { user_id: "u1", name: "CQS Proof Channel" } }),
      videoMedia()
    )
    expect(info.artist).toBe("CQS Proof Channel")
    // ...and does not then repeat it on the line below.
    expect(info.album).toBe(undefined)
  })

  it("says nothing about an author it does not know", () => {
    const info = metadataForPost(post({ author: undefined }), videoMedia())
    expect(info.artist).toBe(undefined)
    expect(info.album).toBe(undefined)
  })

  it("attaches the artwork ladder", () => {
    expect(metadataForPost(post(), videoMedia()).artwork).toEqual([
      { src: "https://media/thumb_150", sizes: "150x150" },
    ])
  })
})
