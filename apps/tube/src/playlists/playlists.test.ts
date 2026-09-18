import { describe, expect, it } from "vitest"
import {
  WATCH_LATER_TITLE,
  findWatchLater,
  isWatchLaterTitle,
  orderedPostIds,
  parsePlaylist,
  parsePlaylists,
  playlistCount,
  playlistCountLabel,
  playlistHref,
  playlistId,
  playlistTitle,
  visibilityLabel,
  type TubePlaylist,
} from "./playlists"

/**
 * The playlist rules, asserted as arithmetic.
 *
 * Every one of these fails silently in a browser: a find-or-create that misses
 * makes a second Watch later on every press, an ordering that trusts the
 * server's array puts a playlist out of order, a title fallback that guesses
 * draws "undefined" down a column.
 */

function playlist(over: Partial<TubePlaylist> = {}): TubePlaylist {
  return {
    id: "p1",
    title: "Trip",
    description: "",
    visibility: "private",
    count: 0,
    reserved: false,
    ...over,
  }
}

describe("reading a row", () => {
  it("takes the id from either field the wire has been seen to use", () => {
    expect(playlistId({ id: "a" })).toBe("a")
    expect(playlistId({ playlist_id: "b" })).toBe("b")
    expect(playlistId({ id: "", playlist_id: "b" })).toBe("b")
  })

  it("has no id to offer for a row with neither", () => {
    expect(playlistId({})).toBeNull()
    expect(playlistId(null)).toBeNull()
    expect(playlistId(undefined)).toBeNull()
    expect(playlistId({ id: "", playlist_id: "" })).toBeNull()
  })

  /**
   * An empty string is PRESENT and falsy, so `??` keeps it and never falls
   * through to the next candidate. A Go struct field with no `omitempty`
   * marshals its zero value, which makes this the ordinary shape on this wire
   * rather than an edge one — and the symptom is a row silently dropped from
   * the list with a perfectly usable value sitting beside the empty one.
   *
   * All three readers are asserted together because this is a CLASS of bug,
   * not one instance: fixing `playlistId` alone would have left the same
   * short-circuit in the two functions either side of it.
   */
  it("falls through an EMPTY field to the next candidate, not only a missing one", () => {
    expect(playlistId({ id: "", playlist_id: "b" })).toBe("b")
    expect(playlistTitle({ title: "", name: "Trip" })).toBe("Trip")
    expect(playlistTitle({ title: "   ", name: "Trip" })).toBe("Trip")
    // Sharper for a count, because the empty value is itself a valid number:
    // `??` would keep the 0 and print "No videos yet" over four videos.
    expect(playlistCount({ item_count: 0, video_count: 4 })).toBe(4)
  })

  it("still drops a row whose only id is the empty one", () => {
    // The fallthrough must not turn into "accept anything": an empty id is
    // still no id, and a link to /playlists/ is a link to nowhere.
    expect(parsePlaylist({ id: "", title: "Trip" })).toBeNull()
  })

  it("never invents a title — an unnamed row is one this client cannot draw", () => {
    // Deliberately NOT "Untitled playlist". A video with no title is still a
    // video; a playlist row with no title is a row we do not understand.
    expect(playlistTitle({ title: "  Trip  " })).toBe("Trip")
    expect(playlistTitle({ name: "Trip" })).toBe("Trip")
    expect(playlistTitle({ title: "   " })).toBeNull()
    expect(playlistTitle({})).toBeNull()
  })

  it("reads a count from either field, and never a negative one", () => {
    expect(playlistCount({ item_count: 3 })).toBe(3)
    expect(playlistCount({ video_count: 4 })).toBe(4)
    expect(playlistCount({ item_count: -1 })).toBe(0)
    expect(playlistCount({})).toBe(0)
  })

  it("drops a row it cannot draw rather than rendering a link to nowhere", () => {
    const rows = parsePlaylists({
      data: [{ id: "a", title: "Keep" }, { id: "b" }, { title: "No id" }, null, "nonsense"],
    })
    expect(rows.map((r) => r.id)).toEqual(["a"])
  })

  it("is an empty list, not a throw, for a body that is not a list", () => {
    expect(parsePlaylists(undefined)).toEqual([])
    expect(parsePlaylists({})).toEqual([])
    expect(parsePlaylists({ data: "nope" })).toEqual([])
  })

  it("lower-cases visibility so one comparison serves every surface", () => {
    expect(parsePlaylist({ id: "a", title: "T", visibility: "PRIVATE" })?.visibility).toBe("private")
  })
})

describe("the reserved Watch later playlist", () => {
  it("matches the title trimmed and case-insensitively, so a merge is predictable", () => {
    // A viewer can make their own "watch later". That is a merge rather than
    // a loss, and matching loosely is what makes it a merge instead of a
    // second hidden list beside theirs.
    expect(isWatchLaterTitle(WATCH_LATER_TITLE)).toBe(true)
    expect(isWatchLaterTitle("watch later")).toBe(true)
    expect(isWatchLaterTitle("  Watch Later  ")).toBe(true)
    expect(isWatchLaterTitle("Watch later soon")).toBe(false)
    expect(isWatchLaterTitle("")).toBe(false)
    expect(isWatchLaterTitle(null)).toBe(false)
  })

  it("marks the reserved row when parsing, so no page has to re-derive it", () => {
    expect(parsePlaylist({ id: "a", title: "Watch Later" })?.reserved).toBe(true)
    expect(parsePlaylist({ id: "a", title: "Trip" })?.reserved).toBe(false)
  })

  it("is null when there is none, which is the signal to create one", () => {
    expect(findWatchLater([])).toBeNull()
    expect(findWatchLater([playlist()])).toBeNull()
  })

  it("picks the OLDEST match, so two tabs racing settle on one list for ever", () => {
    // The server sorts created_at DESC, so the last match in server order is
    // the oldest. A stable tie-break matters more than which one wins: the
    // alternative alternates between two lists on consecutive visits.
    const rows = [
      playlist({ id: "new", title: "Watch later", reserved: true }),
      playlist({ id: "old", title: "Watch later", reserved: true }),
    ]
    expect(findWatchLater(rows)?.id).toBe("old")
  })
})

describe("ordering a playlist's items", () => {
  it("sorts on position rather than trusting the array it arrived in", () => {
    const ids = orderedPostIds([
      { post_id: "c", position: 2 },
      { post_id: "a", position: 0 },
      { post_id: "b", position: 1 },
    ])
    expect(ids).toEqual(["a", "b", "c"])
  })

  it("breaks a tie on arrival order rather than re-shuffling equal rows", () => {
    const ids = orderedPostIds([
      { post_id: "a", position: 0 },
      { post_id: "b", position: 0 },
    ])
    expect(ids).toEqual(["a", "b"])
  })

  it("falls back to arrival order for a row with no position at all", () => {
    expect(orderedPostIds([{ post_id: "a" }, { post_id: "b" }])).toEqual(["a", "b"])
  })

  it("drops a pointer with no post, which has nothing to draw", () => {
    expect(orderedPostIds([{ post_id: "a" }, {}, { post_id: "" }])).toEqual(["a"])
  })

  it("keeps a repeated video once, because React needs one key per child", () => {
    const ids = orderedPostIds([
      { post_id: "a", position: 0 },
      { post_id: "a", position: 1 },
      { post_id: "b", position: 2 },
    ])
    expect(ids).toEqual(["a", "b"])
  })
})

describe("where a playlist lives, and how it reads", () => {
  it("is zone-relative, because next/link adds the basePath itself", () => {
    expect(playlistHref("p1")).toBe("/playlists/p1")
    expect(playlistHref("p1")).not.toContain("/tube")
  })

  it("encodes the id, so a non-UUID one cannot break the route", () => {
    expect(playlistHref("a/b")).toBe("/playlists/a%2Fb")
  })

  it("says nothing about a visibility this client does not know", () => {
    expect(visibilityLabel("private")).toBe("Private")
    expect(visibilityLabel("unlisted")).toBe("Unlisted")
    expect(visibilityLabel("public")).toBe("Public")
    // Printing the raw word would put a server enum on somebody's screen.
    expect(visibilityLabel("members_only")).toBeNull()
    expect(visibilityLabel("")).toBeNull()
  })

  it("states an empty playlist as a fact rather than as '0 videos'", () => {
    expect(playlistCountLabel(0)).toBe("No videos yet")
    expect(playlistCountLabel(1)).toBe("1 video")
    expect(playlistCountLabel(12)).toBe("12 videos")
  })
})
