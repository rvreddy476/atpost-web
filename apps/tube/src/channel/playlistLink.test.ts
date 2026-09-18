import { describe, expect, it } from "vitest"
import { playlistHref, playlistId } from "@/playlists/playlists"
import type { ChannelPlaylist } from "./api"

/**
 * The rule the Playlists tab's rows are linked by.
 *
 * `playlistId` and `playlistHref` belong to ../playlists/playlists.ts and are
 * tested there. What is asserted HERE is that this tab's own row type feeds
 * them correctly — specifically that a `ChannelPlaylist` straight off
 * `/v1/creators/{id}/playlists` satisfies them, and that the empty-string case
 * a Go service produces still yields a link. That is a contract between two
 * modules, and it is the kind that breaks silently: the symptom is a playlist
 * that quietly stops opening, not an error.
 */

const row = (over: Partial<ChannelPlaylist> = {}): ChannelPlaylist => ({ title: "Builds", ...over })

describe("linking a channel's playlist row", () => {
  it("links on `id`", () => {
    expect(playlistHref(playlistId(row({ id: "p1" }))!)).toBe("/playlists/p1")
  })

  it("falls through an EMPTY id to `playlist_id`, which `??` would not", () => {
    // A Go struct field with no `omitempty` marshals "" rather than being
    // absent, so this is the ordinary case on this wire and not an edge one.
    expect(playlistId(row({ id: "", playlist_id: "p2" }))).toBe("p2")
  })

  it("falls through a missing id to `playlist_id`", () => {
    expect(playlistId(row({ playlist_id: "p2" }))).toBe("p2")
  })

  it("is null for a row with neither, so the row stays inert", () => {
    // Inert and still drawn. A link to `/playlists/undefined` is worse than a
    // row that cannot be opened.
    expect(playlistId(row())).toBeNull()
    expect(playlistId(row({ id: "", playlist_id: "" }))).toBeNull()
  })

  it("is zone-relative, because next/link adds the basePath itself", () => {
    // "/tube/playlists/…" here would be served as "/tube/tube/playlists/…".
    expect(playlistHref("p1").startsWith("/playlists/")).toBe(true)
  })
})
