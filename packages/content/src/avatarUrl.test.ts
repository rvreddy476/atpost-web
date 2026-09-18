/**
 * Where a face comes from.
 *
 * The rule is small and every clause in it is a live defect somebody already
 * shipped once:
 *
 *   · the missing zone prefix is why every product photograph in the shop
 *     rendered broken (apps/commerce's lib/media.ts note);
 *   · prefixing an ALREADY absolute url is the same bug in the other
 *     direction — a channel's `avatar_url` is a signed media-host link and
 *     `"/social" + "https://…"` is nothing;
 *   · `avatar` rather than `thumb_150` is what stops a 404 on every avatar
 *     whose source was smaller than 150px, because the image pipeline skips a
 *     rendition larger than the original.
 */

import { describe, expect, it } from "vitest"
import { AVATAR_VARIANT, avatarMediaPath, avatarSrc } from "./avatarUrl"

describe("avatarMediaPath", () => {
  it("asks for the alias, never a stored rendition name", () => {
    expect(AVATAR_VARIANT).toBe("avatar")
    expect(avatarMediaPath("abc")).toBe("/v1/media/abc/serve/avatar")
    // media-service resolves `avatar` against what the asset actually has.
    // A real variant name is served or refused, never substituted.
    expect(avatarMediaPath("abc")).not.toContain("thumb_150")
  })

  it("escapes the id", () => {
    // Ids are uuids in practice, but an unescaped "/" would silently address
    // a different route — the same care hashtagPath takes in apps/social.
    expect(avatarMediaPath("a/b")).toBe("/v1/media/a%2Fb/serve/avatar")
  })
})

describe("avatarSrc", () => {
  it("builds a zone-prefixed url from a media id", () => {
    expect(avatarSrc({ mediaId: "m1" }, "/social")).toBe("/social/v1/media/m1/serve/avatar")
  })

  it("works with no base, which is a zone mounted at the root", () => {
    expect(avatarSrc({ mediaId: "m1" })).toBe("/v1/media/m1/serve/avatar")
    expect(avatarSrc({ mediaId: "m1" }, "")).toBe("/v1/media/m1/serve/avatar")
  })

  it("does not double the separator when the base has a trailing slash", () => {
    expect(avatarSrc({ mediaId: "m1" }, "/social/")).toBe("/social/v1/media/m1/serve/avatar")
  })

  it("prefixes a root-relative url the server sent", () => {
    // profile-service's own `avatar_url` is exactly this shape.
    expect(avatarSrc({ url: "/v1/media/m1/serve/avatar" }, "/social")).toBe(
      "/social/v1/media/m1/serve/avatar"
    )
  })

  it("leaves an absolute url exactly as it is", () => {
    // A channel's `avatar_url` is a signed media-host link. Prefixing one
    // breaks a url that works.
    const signed = "https://media.example/obj/abc?sig=xyz"
    expect(avatarSrc({ url: signed }, "/social")).toBe(signed)
  })

  it("prefers the url the server resolved over an id we would resolve ourselves", () => {
    const signed = "https://media.example/obj/abc?sig=xyz"
    expect(avatarSrc({ url: signed, mediaId: "m1" }, "/social")).toBe(signed)
  })

  it("is null when there is no picture at all", () => {
    // Null and not a path: a component given null draws initials, and one
    // given a url that will 404 draws a broken image first.
    expect(avatarSrc({})).toBeNull()
    expect(avatarSrc({ url: null, mediaId: null })).toBeNull()
    expect(avatarSrc({ url: "   ", mediaId: "  " })).toBeNull()
  })
})
