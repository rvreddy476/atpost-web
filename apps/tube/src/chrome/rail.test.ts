import { describe, expect, it } from "vitest"
import {
  EXIT_ITEM,
  EXPLORE_ITEM,
  EXPLORE_TOPICS_ITEM,
  HOME_ITEM,
  PRIMARY_ITEMS,
  SETTINGS_ITEM,
  SHORTS_ITEM,
  SIGNED_OUT_REASON,
  SUBSCRIPTIONS_ITEM,
  TRENDING_ITEM,
  currentRailId,
  isActionable,
  settingsItem,
  youItems,
  type TubeRailItem,
} from "./rail"
import { parseCollapsed, railKey } from "./railStorage"
import { TUBE_SEARCH_ACTION, normalizeTubeQuery, tubeSearchHref } from "./search"
import { REELS_PATH, reelHref } from "./links"
import { ALL_CHIP, chipKey, chipLabel, chipQuery } from "@/browse/chips"
import { channelTabHref, parseTab } from "@/channel/tabs"

/**
 * The Tube shell's rules, asserted as arithmetic.
 *
 * Everything here is a decision that fails SILENTLY when it is wrong: a row
 * that becomes a link to a route nothing serves, a row marked as the current
 * page when it is not, a stored preference read out of another account's
 * slot, a form that submits to a path missing its basePath. None of them
 * throw, all of them are pure, and a browser is the most expensive possible
 * place to find out about any of them.
 */

const ALL_ROWS: TubeRailItem[] = [
  ...PRIMARY_ITEMS,
  ...youItems({ signedIn: true }),
  SETTINGS_ITEM,
  EXPLORE_ITEM,
  EXIT_ITEM,
]

/** Every in-zone path the rail can send a browser to. */
const IN_ZONE_HREFS = ALL_ROWS.filter((row) => !row.external && row.href).map(
  (row) => row.href as string
)

describe("a row without an href is never a link", () => {
  /**
   * The one safety property of the whole rail. ./RailRow.tsx branches on this
   * predicate and the anchor branch is the only code that reads `href`, so a
   * row with none cannot become an anchor to a 404.
   */
  it("is the only definition of 'available'", () => {
    expect(isActionable(HOME_ITEM)).toBe(true)
    expect(isActionable(settingsItem({ signedIn: false }))).toBe(false)
    expect(isActionable({ ...HOME_ITEM, href: "" })).toBe(false)
    expect(isActionable({ ...HOME_ITEM, href: null })).toBe(false)
  })

  it("pairs every dark row with a reason, and never leaves one unexplained", () => {
    for (const row of [...ALL_ROWS, ...youItems({ signedIn: false })]) {
      if (isActionable(row)) continue
      expect(row.unavailableReason, `${row.id} has no reason`).toBeTruthy()
    }
  })

  it("gives every live row a real absolute-or-rooted path", () => {
    for (const row of ALL_ROWS) {
      if (!isActionable(row)) continue
      expect(row.href!.startsWith("/"), `${row.id} -> ${row.href}`).toBe(true)
    }
  })

  it("never lets a row carry both an href and a reason", () => {
    // The two would disagree, and ./RailRow.tsx would then draw a working
    // link whose `aria-describedby` says it does not work.
    for (const row of [...ALL_ROWS, ...youItems({ signedIn: false })]) {
      expect(isActionable(row) && row.unavailableReason !== null, row.id).toBe(false)
    }
  })

  it("keys every row uniquely, because the id is React's key and the current mark", () => {
    const ids = ALL_ROWS.map((row) => row.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe("in-zone hrefs never carry the zone prefix", () => {
  /**
   * `next/link` adds the basePath itself, so "/tube/subscriptions" would ask
   * for "/tube/tube/subscriptions". Only rows marked `external` are absolute
   * paths into other zones, and those are travelled by a plain <a>.
   */
  it("keeps every in-zone row relative", () => {
    expect(HOME_ITEM.href).toBe("/")
    expect(SUBSCRIPTIONS_ITEM.href).toBe("/subscriptions")
    for (const href of IN_ZONE_HREFS) {
      expect(href.startsWith("/tube"), href).toBe(false)
    }
  })

  it("marks the rows that leave the app, so they are not client transitions", () => {
    expect(EXIT_ITEM.external).toBe(true)
    expect(EXIT_ITEM.href).toBe("/social")
    expect(EXPLORE_ITEM.external).toBe(true)
    // Shorts is the reels zone, not a page of this app. SHORTS_ITEM in
    // ./rail.ts has the argument: a second shorts player here would be a
    // second implementation of the autoplay coordinator and the watch
    // heartbeat a creator is paid on.
    expect(SHORTS_ITEM.external).toBe(true)
    expect(SHORTS_ITEM.href).toBe(REELS_PATH)
    expect(REELS_PATH).toBe("/reels")
  })

  it("deep-links one short absolutely, and escapes the id", () => {
    expect(reelHref("abc")).toBe("/reels/abc")
    expect(reelHref("a/b")).toBe("/reels/a%2Fb")
  })
})

describe("the five discovery rows", () => {
  it("is Home, Shorts, Subscriptions, Trending, Explore, in that order", () => {
    expect(PRIMARY_ITEMS.map((row) => row.id)).toEqual([
      "home",
      "shorts",
      "subscriptions",
      "trending",
      "explore-topics",
    ])
  })

  it("is available to a signed-out visitor, every one of them", () => {
    // The point of the three new rows. Every endpoint behind them is public —
    // /v1/posts/recent, /v1/posts/trending, /v1/posts/categories — and a rail
    // whose only live rows need an account is a rail with nowhere to go.
    for (const row of PRIMARY_ITEMS) {
      expect(isActionable(row), row.id).toBe(true)
      expect(row.unavailableReason, row.id).toBeNull()
    }
  })

  it("gives the two Explores different destinations AND different short words", () => {
    // One is this app's topic browser, the other is the product's mini-app
    // launcher. At 76px both labels truncate, and two rows reading "Explore"
    // would be one word for two places.
    expect(EXPLORE_TOPICS_ITEM.href).toBe("/explore")
    expect(EXPLORE_TOPICS_ITEM.external).toBeFalsy()
    expect(EXPLORE_ITEM.href).toBe("/apps")
    expect(EXPLORE_ITEM.shortLabel).toBe("Apps")
  })

  it("keeps every collapsed word distinct, so no two tiles read the same", () => {
    const words = ALL_ROWS.map((row) => row.shortLabel ?? row.label)
    expect(new Set(words).size).toBe(words.length)
  })

  it("points Trending at its own page", () => {
    expect(TRENDING_ITEM.href).toBe("/trending")
  })
})

describe("currentRailId", () => {
  it("marks Home only on the zone root", () => {
    // "/" is a prefix of every path in the zone, so the boundary rule the
    // other rows use would mark Home current on the watch page and on every
    // channel.
    expect(currentRailId("/", ALL_ROWS)).toBe("home")
    expect(currentRailId("/subscriptions", ALL_ROWS)).toBe("subscriptions")
    expect(currentRailId("/e6eb184f-7dbc-4327-b552-948ce18e42a3", ALL_ROWS)).toBeNull()
  })

  it("matches on a segment boundary and not on a prefix", () => {
    // The same near-prefix defect @momentum/chrome's currentDestinationId has
    // a note about, and the api-gateway's route policy has a test for.
    expect(currentRailId("/subscriptions/anything", ALL_ROWS)).toBe("subscriptions")
    expect(currentRailId("/subscriptionsomething", ALL_ROWS)).toBeNull()
    expect(currentRailId("/watch-laterish", ALL_ROWS)).toBeNull()
  })

  it("ignores a query string on either side", () => {
    expect(currentRailId("/subscriptions?from=rail", ALL_ROWS)).toBe("subscriptions")
    // The home page takes ?category= from the Explore page's tiles, and it is
    // still Home.
    expect(currentRailId("/?category=comedy", ALL_ROWS)).toBe("home")
  })

  it("marks a playlist's own page as Playlists", () => {
    expect(currentRailId("/playlists", ALL_ROWS)).toBe("playlists")
    expect(currentRailId("/playlists/8f14e45f-ceea-467a-9a36-dedd4bea2543", ALL_ROWS)).toBe(
      "playlists"
    )
  })

  it("tells every in-zone row apart from a pathname alone", () => {
    // This is what moving off `/@{handle}?tab=playlists` bought. Two rows that
    // differed only by a query string could not be told apart, because
    // `usePathname()` carries none — and the first match silently won, marking
    // "Your videos" current while you stood on Playlists.
    for (const row of ALL_ROWS) {
      if (row.external || !row.href || row.href === "/") continue
      expect(currentRailId(row.href, ALL_ROWS), row.href).toBe(row.id)
    }
  })

  it("never marks an external row current — you are not inside /social", () => {
    expect(currentRailId("/social", ALL_ROWS)).toBeNull()
    expect(currentRailId("/apps", ALL_ROWS)).toBeNull()
    expect(currentRailId("/reels", ALL_ROWS)).toBeNull()
  })

  it("is null rather than throwing on a path Next has not resolved yet", () => {
    expect(currentRailId(null, ALL_ROWS)).toBeNull()
    expect(currentRailId(undefined, ALL_ROWS)).toBeNull()
    expect(currentRailId("", ALL_ROWS)).toBeNull()
  })
})

describe("the You rows depend on the session, and on nothing else", () => {
  it("is the seven rows, in the order of the brief", () => {
    expect(youItems({ signedIn: true }).map((row) => row.id)).toEqual([
      "your-videos",
      "playlists",
      "watch-later",
      "history",
      "saved",
      "linked-videos",
      "upload",
    ])
  })

  it("links all seven for anybody signed in, with or without a channel", () => {
    // The change of 2026-09-18. "Your videos" and "Playlists" used to be the
    // viewer's own CHANNEL page and went dark with "you have no channel" — a
    // true sentence about a different noun. GET /v1/uploads/videos and
    // GET /v1/creators/{me}/playlists need no channel at all.
    for (const ownChannelRef of ["ada", null]) {
      const rows = youItems({ signedIn: true, ownChannelRef })
      const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
      expect(byId["your-videos"].href).toBe("/your-videos")
      expect(byId.playlists.href).toBe("/playlists")
      expect(byId["watch-later"].href).toBe("/watch-later")
      expect(byId.history.href).toBe("/history")
      expect(byId.saved.href).toBe("/saved")
      expect(byId["linked-videos"].href).toBe("/links")
      expect(byId.upload.href).toBe("/upload")
      expect(rows.every((row) => row.unavailableReason === null)).toBe(true)
    }
  })

  it("blames the session, and only the session, when nobody is signed in", () => {
    const rows = youItems({ signedIn: false, ownChannelRef: "ada" })
    expect(rows.every((row) => row.href === null)).toBe(true)
    expect(rows.every((row) => row.unavailableReason === SIGNED_OUT_REASON)).toBe(true)
  })

  it("never mentions a channel, because no row in the group needs one", () => {
    for (const row of youItems({ signedIn: false })) {
      expect(/channel/i.test(row.unavailableReason ?? ""), row.id).toBe(false)
    }
  })

  it("keeps Watch later and Saved as two rows, because they are two lists", () => {
    const rows = youItems({ signedIn: true })
    const watchLater = rows.find((row) => row.id === "watch-later")
    const saved = rows.find((row) => row.id === "saved")
    // Watch later is a reserved PLAYLIST; Saved is /v1/posts/bookmarks, which
    // is what the watch page's Save button writes. One word for both would be
    // one name for two routes.
    expect(watchLater?.href).not.toBe(saved?.href)
    expect(watchLater?.label).toBe("Watch later")
    expect(saved?.label).toBe("Saved")
  })
})

describe("Settings depends on the session", () => {
  it("is a zone-relative link when signed in", () => {
    const row = settingsItem({ signedIn: true })
    expect(row.href).toBe("/settings")
    expect(row.href).not.toContain("/tube")
    expect(row.external).toBeFalsy()
    expect(row).toBe(SETTINGS_ITEM)
  })

  it("is dark, with the session as the reason, when signed out", () => {
    const row = settingsItem({ signedIn: false })
    expect(isActionable(row)).toBe(false)
    expect(row.unavailableReason).toMatch(/sign in/i)
    expect(row.id).toBe("settings")
  })
})

describe("the collapsed rail, remembered", () => {
  it("keys the preference per account, so a shared machine does not leak", () => {
    expect(railKey("user-a")).not.toBe(railKey("user-b"))
    expect(railKey(null)).toBe(railKey(undefined))
    expect(railKey("  ")).toBe(railKey(null))
  })

  it("namespaces the key, because every zone shares one origin behind the shell", () => {
    expect(railKey("user-a")).toContain("momentum.tube")
  })

  it("treats only an exact '1' as collapsed", () => {
    // Anything else — a value another version wrote, a value typed into
    // devtools, the literal string "false" — is the default, and the default
    // is the rail that shows every destination.
    expect(parseCollapsed("1")).toBe(true)
    expect(parseCollapsed("0")).toBe(false)
    expect(parseCollapsed("true")).toBe(false)
    expect(parseCollapsed("false")).toBe(false)
    expect(parseCollapsed("")).toBe(false)
    expect(parseCollapsed(null)).toBe(false)
    expect(parseCollapsed(undefined)).toBe(false)
  })
})

describe("search", () => {
  it("trims, because the service trims before deciding a query is empty", () => {
    expect(normalizeTubeQuery("  cats  ")).toBe("cats")
    expect(normalizeTubeQuery("   ")).toBe("")
    expect(normalizeTubeQuery(null)).toBe("")
    expect(normalizeTubeQuery(undefined)).toBe("")
  })

  it("submits inside Tube and stays inside Tube", () => {
    // The whole reason this zone has its own results page: a box in the Tube
    // bar that navigates to /social/search leaves the application.
    expect(tubeSearchHref("cats")).toBe("/search?q=cats")
    expect(tubeSearchHref("cats")).not.toContain("/social")
  })

  it("escapes what a person can type into a query", () => {
    expect(tubeSearchHref("a&b=c")).toBe("/search?q=a%26b%3Dc")
    expect(tubeSearchHref("a b")).toBe("/search?q=a%20b")
  })

  it("gives the FORM an absolute action, because a browser adds no basePath", () => {
    // The mirror image of the `next/link` rule: nothing prefixes a form's
    // action, so this one must carry /tube itself or the no-JavaScript
    // submit 404s.
    expect(TUBE_SEARCH_ACTION).toBe("/tube/search")
  })
})

describe("the chip rail's wire arguments", () => {
  it("sends nothing at all for All, so the request is what it always was", () => {
    expect(chipQuery(ALL_CHIP)).toEqual({})
  })

  it("sends exactly one narrowing, never both", () => {
    expect(chipQuery({ kind: "subscriptions" })).toEqual({ subscribedOnly: true })
    expect(chipQuery({ kind: "category", id: "comedy" })).toEqual({ category: "comedy" })
  })

  it("keys categories apart from the two constructed chips", () => {
    expect(chipKey(ALL_CHIP)).toBe("all")
    expect(chipKey({ kind: "category", id: "all" })).toBe("category:all")
  })

  it("labels an unknown slug as the slug, which is a clue rather than 'Unknown'", () => {
    const categories = [{ id: "comedy", label: "Comedy" }]
    expect(chipLabel({ kind: "category", id: "comedy" }, categories)).toBe("Comedy")
    expect(chipLabel({ kind: "category", id: "mystery" }, categories)).toBe("mystery")
    expect(chipLabel(ALL_CHIP, [])).toBe("All")
  })
})

describe("the channel page's tab", () => {
  it("reads the three it has", () => {
    expect(parseTab("videos")).toBe("videos")
    expect(parseTab("playlists")).toBe("playlists")
    expect(parseTab("about")).toBe("about")
  })

  it("forgives the casing and the whitespace a hand-edited URL brings", () => {
    expect(parseTab("Playlists")).toBe("playlists")
    expect(parseTab(" about ")).toBe("about")
  })

  it("falls back to Videos rather than rendering an empty page", () => {
    expect(parseTab("nonsense")).toBe("videos")
    expect(parseTab("")).toBe("videos")
    expect(parseTab(null)).toBe("videos")
    expect(parseTab(undefined)).toBe("videos")
  })

  it("gives a channel ONE canonical address, with no ?tab=videos twin", () => {
    expect(channelTabHref("/@ada", "videos")).toBe("/@ada")
    expect(channelTabHref("/@ada", "playlists")).toBe("/@ada?tab=playlists")
  })
})
