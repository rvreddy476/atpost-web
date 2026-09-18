import { describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

/**
 * The tab strip's MARKUP — the half `./tabs.test.ts` cannot see.
 *
 * Rendered with react-dom/server rather than a testing-library, the way
 * ./SubscribeControls.test.tsx is, because this repo has neither jsdom nor
 * @testing-library installed. What server rendering can assert is every
 * promise the ARIA roles make about structure: one tablist, four tabs, one
 * selected, one tab stop, and every tab pointing at its own panel. What it
 * cannot see is the keypress itself — that is `tabAfterKey`, which is pure and
 * fully covered next door.
 *
 * `next/navigation` is mocked because `useRouter` throws outside an app
 * router, and `next/link` because it wants a router context too. The stub
 * renders a plain anchor, which is what Link renders anyway and is exactly
 * what these assertions are about.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }) }))
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode
    href: string
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { ChannelTabPanel, ChannelTabs } = await import("./ChannelTabs")

const strip = (props: Parameters<typeof ChannelTabs>[0]) =>
  renderToStaticMarkup(<ChannelTabs {...props} />)

describe("ChannelTabs", () => {
  it("is one tablist with a name, holding four tabs", () => {
    const html = strip({ base: "/@ada", current: "videos" })
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Channel sections"')
    expect(html.match(/role="tab"/g)).toHaveLength(4)
  })

  it("selects exactly one tab, and it is the one in the URL", () => {
    const html = strip({ base: "/@ada", current: "shorts" })
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(html.match(/aria-selected="false"/g)).toHaveLength(3)
    // The selected one is Shorts: its own id sits on the element that is true.
    expect(html).toMatch(/id="channel-tab-shorts"[^>]*aria-selected="true"/)
  })

  it("is ONE tab stop for the whole strip", () => {
    // Roving tabindex. Four tab stops on the way to the grid is the thing this
    // pattern exists to avoid.
    const html = strip({ base: "/@ada", current: "videos" })
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html.match(/tabindex="-1"/g)).toHaveLength(3)
  })

  it("keeps real hrefs, so a tab is still a link somebody can send", () => {
    const html = strip({ base: "/@ada", current: "videos" })
    // Videos is the bare address — a channel has one canonical URL.
    expect(html).toContain('href="/@ada"')
    expect(html).toContain('href="/@ada?tab=shorts"')
    expect(html).toContain('href="/@ada?tab=playlists"')
    expect(html).toContain('href="/@ada?tab=about"')
  })

  it("points every tab at its own panel", () => {
    const html = strip({ base: "/@ada", current: "videos" })
    for (const tab of ["videos", "shorts", "playlists", "about"]) {
      expect(html).toContain(`aria-controls="channel-panel-${tab}"`)
      expect(html).toContain(`id="channel-tab-${tab}"`)
    }
  })

  it("draws a count where there is one, and nothing where there is not", () => {
    const html = strip({
      base: "/@ada",
      current: "videos",
      counts: { videos: 12, shorts: null },
    })
    expect(html).toContain('aria-label="Videos, 12"')
    // Null is "we could not read it", never zero — so the label is bare.
    expect(html).toContain('aria-label="Shorts"')
  })

  it("draws a genuine zero, which is a fact worth knowing before you press", () => {
    const html = strip({ base: "/@ada", current: "videos", counts: { shorts: 0 } })
    expect(html).toContain('aria-label="Shorts, 0"')
  })
})

describe("ChannelTabPanel", () => {
  it("is a panel, labelled by its tab, and reachable with Tab", () => {
    const html = renderToStaticMarkup(
      <ChannelTabPanel tab="shorts">
        <p>rows</p>
      </ChannelTabPanel>
    )
    expect(html).toContain('role="tabpanel"')
    expect(html).toContain('id="channel-panel-shorts"')
    expect(html).toContain('aria-labelledby="channel-tab-shorts"')
    // Focusable so that Tab out of the strip lands IN the section rather than
    // skipping past everything in it.
    expect(html).toContain('tabindex="0"')
    expect(html).toContain("rows")
  })
})
