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

  it("pauses on the space bar, under both of its names", () => {
    // Claimed here now, and it has to be: `controls={false}` leaves the player
    // `tabIndex={-1}` with no key handler, so nothing else on this surface
    // binds it and a full-screen video would have no keyboard pause at all.
    expect(reelKeyAction(" ")).toEqual({ kind: "playPause" })
    expect(reelKeyAction("Spacebar")).toEqual({ kind: "playPause" })
  })

  it("takes YouTube's three letters", () => {
    expect(reelKeyAction("m")).toEqual({ kind: "mute" })
    expect(reelKeyAction("M")).toEqual({ kind: "mute" })
    expect(reelKeyAction("l")).toEqual({ kind: "like" })
    expect(reelKeyAction("L")).toEqual({ kind: "like" })
    expect(reelKeyAction("c")).toEqual({ kind: "comments" })
    expect(reelKeyAction("C")).toEqual({ kind: "comments" })
  })

  it("still refuses Home, End, the seek arrows and the digits", () => {
    // Home/End would mean "first short / last short", whose destination MOVES
    // under the person as pages arrive — a key that lands somewhere different
    // each time is worse than no key. ←/→ belong to the progress bar, which
    // handles them itself and stops them there. The digits are a percentage
    // seek on a surface with no visible duration to seek within.
    for (const key of ["ArrowLeft", "ArrowRight", "Home", "End", "0", "5", "9"]) {
      expect(reelKeyAction(key)).toBeNull()
    }
  })

  it("leaves everything else to the page", () => {
    for (const key of ["Tab", "Enter", "Escape", "a", "F5"]) {
      expect(reelKeyAction(key)).toBeNull()
    }
  })

  it("never claims a chord on one of the new letters either", () => {
    // Cmd+L is the address bar and Ctrl+C is copy. Claiming either to like a
    // video would be the single most reported bug this surface could ship.
    expect(reelKeyAction("l", { meta: true })).toBeNull()
    expect(reelKeyAction("c", { ctrl: true })).toBeNull()
    expect(reelKeyAction("m", { alt: true })).toBeNull()
    expect(reelKeyAction(" ", { shift: true })).toBeNull()
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
  it("moves one short at a time", () => {
    expect(moveTarget(2, 1, 10)).toBe(3)
    expect(moveTarget(2, -1, 10)).toBe(1)
  })

  it("clamps rather than wrapping", () => {
    // A jump from the last short back to the first would look like the surface
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
