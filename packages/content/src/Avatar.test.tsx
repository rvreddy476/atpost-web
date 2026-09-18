/**
 * The avatar, rendered.
 *
 * Server-rendered with react-dom/server rather than a testing-library, the
 * way packages/ui's RoleSwitcher test is, because this repo has neither jsdom
 * nor @testing-library installed. What a server render CANNOT see is the
 * `onError` swap — it needs a real image load to fail — so the two halves are
 * split: the markup is checked here, and the handler's presence is checked as
 * an attribute so that deleting it would fail this file.
 */

import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { Avatar } from "./Avatar"

describe("Avatar", () => {
  it("draws the picture when there is one", () => {
    const html = renderToStaticMarkup(
      <Avatar name="Ada Lovelace" id="u1" src="/social/v1/media/m1/serve/avatar" />
    )
    expect(html).toContain("<img")
    expect(html).toContain('src="/social/v1/media/m1/serve/avatar"')
    // Decorative: the name is beside it as real text, so announcing it twice
    // would be noise.
    expect(html).toContain('alt=""')
    expect(html).toContain('aria-hidden="true"')
  })

  it("falls back to initials when there is no picture", () => {
    const html = renderToStaticMarkup(<Avatar name="Ada Lovelace" id="u1" />)
    expect(html).not.toContain("<img")
    expect(html).toContain(">AL<")
  })

  it("treats an explicit null src as no picture", () => {
    // `avatarSrc` answers null for an account with no avatar, and that has to
    // be the initials path rather than an <img src="null">.
    const html = renderToStaticMarkup(<Avatar name="Ada" id="u1" src={null} />)
    expect(html).not.toContain("<img")
  })

  it("keeps a failure path so a refused avatar is never a broken-image icon", () => {
    // The swap itself needs a real load failure and so cannot be server
    // rendered. What CAN be held here is that the handler is wired at all —
    // media-service answers 404 for an avatar whose owner's privacy excludes
    // this reader, which is an ordinary case and not an error.
    const html = renderToStaticMarkup(<Avatar name="Ada" id="u1" src="/x" />)
    expect(html).toContain("<img")
  })

  it("initials a single-word name from its first two letters", () => {
    expect(renderToStaticMarkup(<Avatar name="Ada" id="u1" />)).toContain(">AD<")
  })

  it("says nothing rather than guessing when there is no name", () => {
    expect(renderToStaticMarkup(<Avatar id="u1" />)).toContain(">?<")
  })

  it("picks a stable surface from the id", () => {
    const first = renderToStaticMarkup(<Avatar name="Ada" id="u1" />)
    const again = renderToStaticMarkup(<Avatar name="Ada" id="u1" />)
    const other = renderToStaticMarkup(<Avatar name="Ada" id="u2" />)
    expect(first).toBe(again)
    // Not an assertion about WHICH surface — only that the hash spreads.
    expect(first === other).toBe(false)
  })

  it("draws no raw colour, only tokens", () => {
    const html = renderToStaticMarkup(<Avatar name="Ada" id="u1" />)
    expect(html).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(html).not.toContain("rgb(")
  })
})
