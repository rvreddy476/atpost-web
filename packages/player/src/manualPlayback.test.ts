import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  __resetManualPlayback,
  claimManualPlayback,
  releaseManualPlayback,
  revokeManualPlaybackExcept,
} from "./manualPlayback"

/**
 * The invariant these guard is the one the coordinator's header is emphatic
 * about — one video, ever — extended to cover the door the coordinator does
 * not watch: a person pressing play on a surface where nothing is `active`.
 */
describe("manualPlayback", () => {
  beforeEach(() => __resetManualPlayback())

  it("displaces the previous holder", () => {
    const first = vi.fn()
    const second = vi.fn()
    claimManualPlayback("a", first)
    claimManualPlayback("b", second)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it("does not revoke a player re-claiming its own slot", () => {
    // A component whose `onRevoke` closure changed identity between renders
    // would otherwise pause itself on every render.
    const revoke = vi.fn()
    claimManualPlayback("a", revoke)
    claimManualPlayback("a", vi.fn())
    expect(revoke).not.toHaveBeenCalled()
  })

  it("releases only for the holder", () => {
    // React unmounts and mounts in an order that regularly runs an old
    // cleanup after a new claim; an unguarded release would hand the new
    // holder's slot away silently.
    const held = vi.fn()
    claimManualPlayback("a", held)
    releaseManualPlayback("stale-id")
    const next = vi.fn()
    claimManualPlayback("b", next)
    expect(held).toHaveBeenCalledTimes(1)
  })

  it("revokes when the coordinator picks somebody else", () => {
    const revoke = vi.fn()
    claimManualPlayback("a", revoke)
    revokeManualPlaybackExcept("b")
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it("leaves the holder alone when the coordinator picks it", () => {
    // The common case: the person pressed play on the card that then scrolled
    // far enough in to become active. Pausing it there would be the feed
    // undoing the thing the person just asked for.
    const revoke = vi.fn()
    claimManualPlayback("a", revoke)
    revokeManualPlaybackExcept("a")
    expect(revoke).not.toHaveBeenCalled()
  })

  it("revokes everything when the coordinator picks nothing", () => {
    const revoke = vi.fn()
    claimManualPlayback("a", revoke)
    revokeManualPlaybackExcept(null)
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it("is safe to poke at when nobody holds it", () => {
    expect(() => {
      releaseManualPlayback("a")
      revokeManualPlaybackExcept("a")
      revokeManualPlaybackExcept(null)
    }).not.toThrow()
  })
})
