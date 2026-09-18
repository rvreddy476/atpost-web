import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { LikeBurst, MuteButton, PausedMark, PlayPauseButton, ProgressBar } from "./ReelTransport"

/**
 * Rendered with react-dom/server rather than a testing library, the way
 * apps/tube's SubscribeControls test is, because this repo has neither jsdom
 * nor @testing-library installed. Every one of these is a pure function of its
 * props, so every state is one render. What server rendering cannot see is the
 * drag itself, which is arithmetic and lives in ./transport.ts with its own
 * tests.
 */

const noop = () => undefined

describe("ProgressBar", () => {
  it("is a real slider carrying its position", () => {
    const html = renderToStaticMarkup(
      <ProgressBar currentSeconds={15} durationSeconds={60} onSeek={noop} label="the short by Ada" />
    )
    expect(html).toContain('role="slider"')
    expect(html).toContain('aria-valuenow="15"')
    expect(html).toContain('aria-valuemax="60"')
    // The spoken position. The live region on this surface deliberately says
    // nothing about the playhead, so this is the only place it is available.
    expect(html).toContain('aria-valuetext="15 seconds of 60"')
    expect(html).toContain('aria-label="Seek the short by Ada"')
  })

  it("is reachable by keyboard", () => {
    const html = renderToStaticMarkup(
      <ProgressBar currentSeconds={0} durationSeconds={30} onSeek={noop} label="a short" />
    )
    expect(html).toContain('tabindex="0"')
  })

  it("paints the fill as a percentage of the duration", () => {
    const html = renderToStaticMarkup(
      <ProgressBar currentSeconds={30} durationSeconds={60} onSeek={noop} label="a short" />
    )
    expect(html).toContain("width:50%")
  })

  it("draws nothing rather than NaN before metadata lands", () => {
    // Two different NaN routes, and the ARIA one outlived the first fix: a NaN
    // in the style attribute produces a bar that is silently not drawn at all,
    // while a NaN in `aria-valuemax` is read out loud — `Math.max(0,
    // Math.round(NaN))` is NaN, because neither of them rejects it.
    const html = renderToStaticMarkup(
      <ProgressBar currentSeconds={0} durationSeconds={Number.NaN} onSeek={noop} label="a short" />
    )
    expect(html).not.toContain("NaN")
    expect(html).toContain("width:0%")
    expect(html).toContain('aria-valuemax="0"')
    expect(html).toContain('aria-valuenow="0"')
  })

  it("does not report an infinite duration either", () => {
    // Which is what the element reports for a live stream.
    const html = renderToStaticMarkup(
      <ProgressBar
        currentSeconds={5}
        durationSeconds={Number.POSITIVE_INFINITY}
        onSeek={noop}
        label="a short"
      />
    )
    expect(html).toContain('aria-valuemax="0"')
    expect(html).not.toContain("Infinity")
  })
})

describe("MuteButton", () => {
  it("names the action and carries the state separately", () => {
    const muted = renderToStaticMarkup(<MuteButton muted onToggle={noop} />)
    expect(muted).toContain('aria-label="Unmute"')
    expect(muted).toContain('aria-pressed="true"')

    const loud = renderToStaticMarkup(<MuteButton muted={false} onToggle={noop} />)
    expect(loud).toContain('aria-label="Mute"')
    expect(loud).toContain('aria-pressed="false"')
  })
})

describe("PlayPauseButton", () => {
  it("names what pressing it will do", () => {
    expect(renderToStaticMarkup(<PlayPauseButton paused onToggle={noop} />)).toContain(
      'aria-label="Play"'
    )
    expect(renderToStaticMarkup(<PlayPauseButton paused={false} onToggle={noop} />)).toContain(
      'aria-label="Pause"'
    )
  })
})

describe("PausedMark", () => {
  it("is drawn only while paused", () => {
    // A frozen frame with no mark on it is indistinguishable from a video that
    // failed to start, which is the loudest complaint this surface has had.
    expect(renderToStaticMarkup(<PausedMark paused />)).not.toBe("")
    expect(renderToStaticMarkup(<PausedMark paused={false} />)).toBe("")
  })

  it("is decoration, not a second play control", () => {
    // The picture behind it is already the control; a button on top would be
    // two tab stops for one act.
    const html = renderToStaticMarkup(<PausedMark paused />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain("<button")
  })
})

describe("LikeBurst", () => {
  it("is nothing at all when it is not shown", () => {
    // Which is also how reduced motion is honoured: the caller passes false
    // and there is no gentler heart to fall back to.
    expect(renderToStaticMarkup(<LikeBurst shown={false} />)).toBe("")
  })

  it("says nothing to a screen reader when it is", () => {
    // The like is announced in the live region; this mark is pure animation.
    const html = renderToStaticMarkup(<LikeBurst shown />)
    expect(html).toContain('aria-hidden="true"')
  })
})
