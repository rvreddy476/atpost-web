/**
 * What each section actually asks the server for.
 *
 * The one test here that is worth more than the others is
 * "following never asks for ranked". It guards a live, reproducible defect in
 * feed-service rather than a preference:
 *
 *   `GetHomeFeed` applies `following_only` as a filter over the viewer's
 *   timeline candidates, and THEN runs its cold-start fallback on
 *   `len(candidates) == 0 && feedMode == "ranked"` without consulting
 *   `followingOnly`. For a viewer who follows nobody the filter empties the
 *   set and the fallback refills it with recent public posts.
 *
 * Verified on the live gateway (2026-09-09, an account that follows nobody):
 * `?feed_mode=ranked&following_only=true` returned the SAME five posts as
 * plain `?feed_mode=ranked`. Send `ranked` here and the Following tab quietly
 * serves strangers under a heading that promises otherwise — a failure with
 * nothing on screen to notice it by, which is the kind a test has to hold.
 */

import { describe, expect, it } from "vitest"
import { hashtagParams, hashtagPath, homeFeedParams } from "./tabApi"

describe("homeFeedParams", () => {
  it("asks For You for the ranked feed, with no narrowing", () => {
    // `ranked` is the mode with the cold-start path: a brand-new account that
    // follows nobody still gets a front door. See ./api.ts.
    expect(homeFeedParams("for-you")).toEqual({ limit: 20, feed_mode: "ranked" })
  })

  it("never asks Following for ranked", () => {
    const params = homeFeedParams("following")
    expect(params.feed_mode).toBe("chronological")
    expect(params.feed_mode).not.toBe("ranked")
    expect(params.following_only).toBe(true)
  })

  it("passes a cursor through, and omits it when there is none", () => {
    expect(homeFeedParams("for-you", "2026-09-06T20:02:24.906757Z")).toEqual({
      limit: 20,
      feed_mode: "ranked",
      cursor: "2026-09-06T20:02:24.906757Z",
    })
    expect(homeFeedParams("for-you", null)).not.toHaveProperty("cursor")
    // An empty string is not a cursor. Sending one would be a 400
    // INVALID_CURSOR on a request that meant "the first page".
    expect(homeFeedParams("for-you", "")).not.toHaveProperty("cursor")
  })
})

describe("hashtagPath", () => {
  it("escapes the tag", () => {
    expect(hashtagPath("momentum")).toBe("/v1/hashtags/momentum/posts")
    // A tag reaches this normalised, but the path segment is still built
    // safely: an unescaped "/" would silently address a different route.
    expect(hashtagPath("a/b")).toBe("/v1/hashtags/a%2Fb/posts")
  })
})

describe("hashtagParams", () => {
  it("asks for recent rather than top", () => {
    // A tag feed sorted by all-time engagement opens on the same three posts
    // every day, which is an archive, not a feed.
    expect(hashtagParams()).toEqual({ limit: 20, sort: "recent" })
  })

  it("passes a cursor through", () => {
    expect(hashtagParams("abc")).toEqual({ limit: 20, sort: "recent", cursor: "abc" })
  })
})
