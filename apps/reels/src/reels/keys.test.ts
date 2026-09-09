import { describe, expect, it } from "vitest"
import { moveTarget, reelKeyAction } from "./keys"

describe("reelKeyAction", () => {
  it("moves down on ArrowDown, PageDown and j", () => {
    for (const key of ["ArrowDown", "PageDown", "j", "J"]) {
      expect(reelKeyAction(key)).toEqual({ kind: "move", delta: 1 })
    }
  })

  it("moves up on ArrowUp, PageUp and k", () => {
    for (const key of ["ArrowUp", "PageUp", "k", "K"]) {
      expect(reelKeyAction(key)).toEqual({ kind: "move", delta: -1 })
    }
  })

  it("leaves the player's own keys alone", () => {
    // Space, m, ←, →, Home, End and the digits belong to MomentumVideo's
    // transport. It stops propagation on each of them, so they never reach
    // this — but claiming one here would still be a second meaning for the
    // same press depending on where the focus happened to be.
    for (const key of [" ", "m", "M", "ArrowLeft", "ArrowRight", "Home", "End", "0", "5", "9"]) {
      expect(reelKeyAction(key)).toBeNull()
    }
  })

  it("leaves everything else to the page", () => {
    for (const key of ["Tab", "Enter", "Escape", "a", "F5"]) {
      expect(reelKeyAction(key)).toBeNull()
    }
  })

  it("never claims a modifier chord", () => {
    // Ctrl+Home is "top of document" and Cmd+Down is "end of document" on
    // macOS. Claiming either would break the browser to move a video.
    expect(reelKeyAction("ArrowDown", { ctrl: true })).toBeNull()
    expect(reelKeyAction("ArrowUp", { meta: true })).toBeNull()
    expect(reelKeyAction("j", { alt: true })).toBeNull()
    expect(reelKeyAction("k", { shift: true })).toBeNull()
  })
})

describe("moveTarget", () => {
  it("moves one reel at a time", () => {
    expect(moveTarget(2, 1, 10)).toBe(3)
    expect(moveTarget(2, -1, 10)).toBe(1)
  })

  it("clamps rather than wrapping", () => {
    // A jump from the last reel back to the first would look like the surface
    // had silently reloaded, and the top of the list is no place to say "you
    // have reached the end".
    expect(moveTarget(9, 1, 10)).toBe(9)
    expect(moveTarget(0, -1, 10)).toBe(0)
  })

  it("has nowhere to go in an empty feed", () => {
    expect(moveTarget(0, 1, 0)).toBe(0)
    expect(moveTarget(3, -1, 0)).toBe(0)
  })
})
