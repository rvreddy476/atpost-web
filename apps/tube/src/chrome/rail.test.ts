import { describe, expect, it } from "vitest"
import {
  SIGNED_OUT_REASON,
  EXIT_ITEM,
  EXPLORE_ITEM,
  HOME_ITEM,
  PRIMARY_ITEMS,
  SETTINGS_ITEM,
  SUBSCRIPTIONS_ITEM,
  currentRailId,
  isActionable,
  settingsItem,
  youItems,
  type TubeRailItem,
} from "./rail"
import { parseCollapsed, railKey } from "./railStorage"
import { TUBE_SEARCH_ACTION, normalizeTubeQuery, tubeSearchHref } from "./search"
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
  ...youItems({ signedIn: true, ownChannelRef: "ada" }),
  SETTINGS_ITEM,
  EXPLORE_ITEM,
  EXIT_ITEM,
]

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
    for (const row of ALL_ROWS) {
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
})

describe("in-zone hrefs never carry the zone prefix", () => {
  /**
   * `next/link` adds the basePath itself, so "/tube/subscriptions" would ask
   * for "/tube/tube/subscriptions". Only rows marked `external` are absolute
   * paths into other zones, and those are travelled by a plain <a>.
   */
  it("keeps Home and Subscriptions relative", () => {
    expect(HOME_ITEM.href).toBe("/")
    expect(SUBSCRIPTIONS_ITEM.href).toBe("/subscriptions")
    expect(SUBSCRIPTIONS_ITEM.href).not.toContain("/tube")
    expect(HOME_ITEM.external).toBeFalsy()
  })

  it("marks the rows that leave the app, so they are not client transitions", () => {
    expect(EXIT_ITEM.external).toBe(true)
    expect(EXIT_ITEM.href).toBe("/social")
    expect(EXPLORE_ITEM.external).toBe(true)
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
  })

  it("ignores a query string on either side", () => {
    expect(currentRailId("/subscriptions?from=rail", ALL_ROWS)).toBe("subscriptions")
  })

  it("marks the viewer's own channel for both of the rows that point at it", () => {
    // "Your videos" is `/@you` and "Playlists" is `/@you?tab=playlists`, and
    // `usePathname()` carries no query — so the first match wins. Asserted
    // rather than left to be discovered: the alternative is reading
    // `useSearchParams()` in the shell, which would make every route in the
    // zone dynamically rendered to mark one row. See the note on the function.
    expect(currentRailId("/@ada", ALL_ROWS)).toBe("your-videos")
    expect(currentRailId("/@ada?tab=playlists", ALL_ROWS)).toBe("your-videos")
  })

  it("never marks an external row current — you are not inside /social", () => {
    expect(currentRailId("/social", ALL_ROWS)).toBeNull()
    expect(currentRailId("/apps", ALL_ROWS)).toBeNull()
  })

  it("is null rather than throwing on a path Next has not resolved yet", () => {
    expect(currentRailId(null, ALL_ROWS)).toBeNull()
    expect(currentRailId(undefined, ALL_ROWS)).toBeNull()
    expect(currentRailId("", ALL_ROWS)).toBeNull()
  })
})

describe("the You rows depend on the viewer, honestly", () => {
  it("offers the viewer's own channel once they have one", () => {
    const rows = youItems({ signedIn: true, ownChannelRef: "ada" })
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
    expect(byId["your-videos"].href).toBe("/@ada")
    expect(byId.playlists.href).toBe("/@ada?tab=playlists")
  })

  it("says why, rather than going dark, for an account with no channel", () => {
    const rows = youItems({ signedIn: true, ownChannelRef: null })
    const own = rows.filter((row) => row.id === "your-videos" || row.id === "playlists")
    expect(own.every((row) => row.href === null)).toBe(true)
    // post-service answers 403 CHANNEL_REQUIRED to a long video from an
    // account with no channel, so "no videos" and "no channel" are one fact.
    expect(own.every((row) => /channel/i.test(row.unavailableReason ?? ""))).toBe(true)
  })

  it("blames the session, not the channel, when nobody is signed in", () => {
    const rows = youItems({ signedIn: false, ownChannelRef: "ada" })
    expect(rows.every((row) => row.href === null)).toBe(true)
    expect(rows.every((row) => /sign in/i.test(row.unavailableReason ?? ""))).toBe(true)
  })

  it("links History and Saved for anybody signed in, channel or not", () => {
    // Both were dark while nothing served them; /history and /saved are
    // pages of this zone now. They gate on the session and NOT on the
    // channel: a viewer who has never published still has a history.
    for (const ownChannelRef of ["ada", null]) {
      const rows = youItems({ signedIn: true, ownChannelRef })
      const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
      expect(byId.history.href).toBe("/history")
      expect(byId.saved.href).toBe("/saved")
      expect(byId.history.unavailableReason).toBeNull()
      expect(byId.saved.unavailableReason).toBeNull()
    }
  })

  it("keeps History and Saved dark, blaming the session, when signed out", () => {
    const rows = youItems({ signedIn: false, ownChannelRef: null })
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]))
    expect(byId.history.href).toBeNull()
    expect(byId.saved.href).toBeNull()
    expect(byId.history.unavailableReason).toMatch(/sign in/i)
  })

  it("marks the two new rows current on their own pages, and on nothing else", () => {
    expect(currentRailId("/history", ALL_ROWS)).toBe("history")
    expect(currentRailId("/saved", ALL_ROWS)).toBe("saved")
    expect(currentRailId("/settings", ALL_ROWS)).toBe("settings")
    expect(currentRailId("/historyish", ALL_ROWS)).toBeNull()
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

describe("the two creator rows in You", () => {
  it("links Upload and Linked videos for anybody signed in, with or without a channel", () => {
    for (const ownChannelRef of ["ada", null]) {
      const items = youItems({ signedIn: true, ownChannelRef })
      const upload = items.find((i) => i.id === "upload")
      const links = items.find((i) => i.id === "linked-videos")
      expect(upload?.href).toBe("/upload")
      expect(upload?.unavailableReason).toBeNull()
      expect(links?.href).toBe("/links")
      expect(links?.unavailableReason).toBeNull()
    }
  })

  it("keeps them dark, blaming the session, when signed out", () => {
    const items = youItems({ signedIn: false, ownChannelRef: null })
    for (const id of ["upload", "linked-videos"]) {
      const row = items.find((i) => i.id === id)
      expect(row?.href).toBeNull()
      expect(row?.unavailableReason).toBe(SIGNED_OUT_REASON)
    }
  })

  it("puts the creator rows before the viewer rows", () => {
    const ids = youItems({ signedIn: true, ownChannelRef: "ada" }).map((i) => i.id)
    expect(ids.indexOf("upload")).toBeLessThan(ids.indexOf("history"))
    expect(ids.indexOf("linked-videos")).toBeLessThan(ids.indexOf("history"))
  })
})
