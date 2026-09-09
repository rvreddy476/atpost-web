import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  __resetSoundPreference,
  armSound,
  disarmSound,
  isActivationKey,
  noteUnmutedPlaybackRefused,
  soundIsArmed,
  watchForSoundGesture,
} from "./soundPreference"

/* ── A document that records instead of being a browser ────────────────────
 *
 * These tests are about a bit and about three listeners, and the interesting
 * claims are all about the listeners: that they are installed once for twenty
 * players, that the FIRST gesture removes them, and that a scroll is not a
 * gesture. None of that is observable without being able to see the
 * add/remove calls, so the document is a stub that records them.
 *
 * It also has to remove by identity AND capture flag, because that is what a
 * real `removeEventListener` does — a stub that ignored the flag would let a
 * leak through unnoticed.
 */

interface Registered {
  type: string
  handler: (event: unknown) => void
  capture: boolean
}

let registered: Registered[] = []
let originalDocument: PropertyDescriptor | undefined

function installDocument(): void {
  registered = []
  const fake = {
    addEventListener(type: string, handler: (event: unknown) => void, options?: { capture?: boolean }) {
      registered.push({ type, handler, capture: Boolean(options?.capture) })
    },
    removeEventListener(type: string, handler: (event: unknown) => void, options?: { capture?: boolean }) {
      const capture = Boolean(options?.capture)
      registered = registered.filter(
        (r) => !(r.type === type && r.handler === handler && r.capture === capture)
      )
    },
  }
  Object.defineProperty(globalThis, "document", { value: fake, configurable: true, writable: true })
}

/** Fire an event at every listener that would receive it. */
function dispatch(event: { type: string; key?: string }): void {
  for (const r of [...registered]) {
    if (r.type === event.type) r.handler(event)
  }
}

const types = () => registered.map((r) => r.type).sort()

describe("soundPreference", () => {
  beforeEach(() => {
    originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document")
    installDocument()
    __resetSoundPreference()
  })

  afterEach(() => {
    __resetSoundPreference()
    if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument)
    else Reflect.deleteProperty(globalThis, "document")
  })

  describe("what counts as a gesture", () => {
    it("starts silent, because a browser will not start anything else", () => {
      watchForSoundGesture()
      expect(soundIsArmed()).toBe(false)
    })

    it("arms on a pointerdown", () => {
      watchForSoundGesture()
      dispatch({ type: "pointerdown" })
      expect(soundIsArmed()).toBe(true)
    })

    it("arms on a touchend", () => {
      watchForSoundGesture()
      dispatch({ type: "touchend" })
      expect(soundIsArmed()).toBe(true)
    })

    it("arms on a real key", () => {
      watchForSoundGesture()
      dispatch({ type: "keydown", key: " " })
      expect(soundIsArmed()).toBe(true)
    })

    it("does NOT arm on a modifier, an Escape, or a Tab", () => {
      // Half a chord, a dismissal, and somebody tabbing past the feed on the
      // way to something else. None of them is "I want to hear this".
      watchForSoundGesture()
      dispatch({ type: "keydown", key: "Shift" })
      dispatch({ type: "keydown", key: "Escape" })
      dispatch({ type: "keydown", key: "Tab" })
      expect(soundIsArmed()).toBe(false)
    })

    it("never listens for scroll or mousemove", () => {
      // The two that browsers do not treat as activation either, and the two
      // that would make a feed shout at somebody who only moved a thumb.
      watchForSoundGesture()
      expect(types()).toEqual(["keydown", "pointerdown", "touchend"])
    })

    it("listens in the capture phase", () => {
      // The player's own key handler calls stopPropagation so an arrow key
      // does not also turn a carousel page. The gesture still happened.
      watchForSoundGesture()
      expect(registered.every((r) => r.capture)).toBe(true)
    })
  })

  describe("the listeners", () => {
    it("installs three for twenty players, not sixty", () => {
      for (let i = 0; i < 20; i += 1) watchForSoundGesture()
      expect(registered).toHaveLength(3)
    })

    it("stops listening the moment it has its answer", () => {
      watchForSoundGesture()
      dispatch({ type: "pointerdown" })
      expect(registered).toHaveLength(0)
    })

    it("keeps listening while any player is still mounted", () => {
      const first = watchForSoundGesture()
      watchForSoundGesture()
      first()
      expect(registered).toHaveLength(3)
    })

    it("removes them when the last player unmounts", () => {
      const first = watchForSoundGesture()
      const second = watchForSoundGesture()
      first()
      second()
      expect(registered).toHaveLength(0)
    })

    it("survives a release called twice", () => {
      // React runs cleanups in orders that produce exactly this.
      const release = watchForSoundGesture()
      watchForSoundGesture()
      release()
      release()
      expect(registered).toHaveLength(3)
    })

    it("does not install any before a player exists", () => {
      // The clock starts at the first player's mount, which is what stops a
      // click on a nav link from arming sound for the page it lands on.
      expect(registered).toHaveLength(0)
      expect(soundIsArmed()).toBe(false)
    })

    it("does not reinstall them once the page has been touched", () => {
      watchForSoundGesture()
      dispatch({ type: "pointerdown" })
      watchForSoundGesture()
      expect(registered).toHaveLength(0)
    })
  })

  describe("the speaker button", () => {
    it("arms directly, without waiting to infer anything", () => {
      armSound()
      expect(soundIsArmed()).toBe(true)
    })

    it("disarms, and a later click does NOT bring the sound back", () => {
      // The one that matters. Somebody who silenced a video must not have
      // sound handed back to them by their next press of a like button.
      watchForSoundGesture()
      armSound()
      disarmSound()
      watchForSoundGesture()
      dispatch({ type: "pointerdown" })
      expect(soundIsArmed()).toBe(false)
    })

    it("clears a refusal, because the press IS the gesture", () => {
      noteUnmutedPlaybackRefused()
      expect(soundIsArmed()).toBe(false)
      armSound()
      expect(soundIsArmed()).toBe(true)
    })
  })

  describe("a browser that says no", () => {
    it("stops asking for the rest of the session", () => {
      // Safari refuses the next one too, and the one after that. Without the
      // latch every video would hitch on the same failed attempt.
      watchForSoundGesture()
      dispatch({ type: "pointerdown" })
      expect(soundIsArmed()).toBe(true)
      noteUnmutedPlaybackRefused()
      expect(soundIsArmed()).toBe(false)
    })

    it("is not undone by another gesture", () => {
      noteUnmutedPlaybackRefused()
      watchForSoundGesture()
      dispatch({ type: "pointerdown" })
      expect(soundIsArmed()).toBe(false)
    })
  })

  describe("without a document", () => {
    it("is safe on the server and answers false", () => {
      Reflect.deleteProperty(globalThis, "document")
      expect(() => {
        const release = watchForSoundGesture()
        release()
      }).not.toThrow()
      expect(soundIsArmed()).toBe(false)
    })
  })
})

describe("isActivationKey", () => {
  it("accepts the keys a person presses on purpose", () => {
    for (const key of [" ", "k", "M", "ArrowRight", "Enter", "a", "1"]) {
      expect(isActivationKey(key)).toBe(true)
    }
  })

  it("rejects the keys that are half a press", () => {
    for (const key of ["Shift", "Control", "Alt", "Meta", "CapsLock", "Escape", "Tab"]) {
      expect(isActivationKey(key)).toBe(false)
    }
  })
})
