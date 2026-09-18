import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { VIDEO_GRID } from "@/browse/grid"
import { SHORTS_GRID } from "./ShortCard"
import {
  ChannelGridSkeleton,
  ChannelLoadError,
  ChannelNotFound,
  TabEmpty,
  TabError,
} from "./states"

/**
 * The states, and the one distinction the whole file exists to keep.
 *
 * "No such channel" and "could not be loaded" must never be the same sentence.
 * Telling a creator their channel is gone because a request timed out is the
 * worst answer this page can give, and it is a one-character change away at
 * every layer — which is why it is asserted here as well as reasoned about in
 * three file headers.
 */

describe("ChannelNotFound", () => {
  it("echoes the handle back, because a typo is the commonest cause", () => {
    const html = renderToStaticMarkup(<ChannelNotFound channelRef="adaa" />)
    expect(html).toContain("@adaa")
    expect(html).toContain("No such channel")
  })

  it("reads correctly with no handle to echo", () => {
    // `notFound()` carries nothing with it, so the route-level 404 renders
    // this branch.
    const html = renderToStaticMarkup(<ChannelNotFound />)
    expect(html).toContain("No such channel")
    expect(html).not.toContain("undefined")
  })

  it("does NOT claim anything failed", () => {
    expect(renderToStaticMarkup(<ChannelNotFound channelRef="ada" />)).not.toContain("could not")
  })
})

describe("ChannelLoadError", () => {
  it("says the request failed, and never that the channel is gone", () => {
    const html = renderToStaticMarkup(<ChannelLoadError />)
    expect(html).toContain("could not be loaded")
    expect(html).not.toContain("No such channel")
  })

  it("is announced, because nobody pressed anything to cause it", () => {
    expect(renderToStaticMarkup(<ChannelLoadError />)).toContain('role="alert"')
  })
})

describe("ChannelGridSkeleton", () => {
  it("reserves the shape of the tab that is loading", () => {
    // A skeleton whose column count differs from the grid it stands in for
    // re-flows the page on arrival, which is the one thing it exists to stop.
    expect(renderToStaticMarkup(<ChannelGridSkeleton kind="videos" />)).toContain(VIDEO_GRID)
    expect(renderToStaticMarkup(<ChannelGridSkeleton kind="shorts" />)).toContain(SHORTS_GRID)
  })

  it("uses each tab's own aspect", () => {
    expect(renderToStaticMarkup(<ChannelGridSkeleton kind="videos" />)).toContain("aspect-video")
    expect(renderToStaticMarkup(<ChannelGridSkeleton kind="shorts" />)).toContain("aspect-[9/16]")
  })

  it("is hidden from a screen reader, since it is furniture and not content", () => {
    expect(renderToStaticMarkup(<ChannelGridSkeleton kind="videos" count={2} />)).toContain(
      'aria-hidden="true"'
    )
  })
})

describe("TabEmpty", () => {
  it("names the channel and the kind, so it is clear WHICH tab is empty", () => {
    const html = renderToStaticMarkup(
      <TabEmpty title="Ada hasn't posted a video yet" body="It will appear here." />
    )
    expect(html).toContain("Ada hasn&#x27;t posted a video yet")
  })
})

describe("TabError", () => {
  it("offers the one thing to do about it", () => {
    const html = renderToStaticMarkup(<TabError what="Shorts" onRetry={() => undefined} />)
    expect(html).toContain("Shorts could not be loaded")
    expect(html).toContain("Try again")
  })

  it("is announced, and says the rest of the page still works", () => {
    // A silent empty grid reads as "this channel has no videos", which is a
    // false statement produced by a network error.
    const html = renderToStaticMarkup(<TabError what="Videos" onRetry={() => undefined} />)
    expect(html).toContain('role="alert"')
    expect(html).toContain("rest of this page is unaffected")
  })
})
