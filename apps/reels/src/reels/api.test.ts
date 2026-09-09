import { describe, expect, it } from "vitest"
import { followStateOf } from "./api"

/**
 * The graph relationship, as the one button that can be drawn from it.
 *
 * The rows below are the real shape `POST /v1/graph/relationships/batch`
 * returns, taken from a live call rather than from the Go struct: it answers a
 * BARE MAP with no `{data}` envelope, keyed by target id, and this is one of
 * its values.
 */
describe("followStateOf", () => {
  it("reads a plain follow", () => {
    expect(followStateOf({ follows: true, follow_request_status: "none" })).toBe("following")
  })

  it("reads a pending request as 'requested', not 'following'", () => {
    // The case nobody designs for, and the reason FollowButton has three
    // states: following a private account creates a REQUEST, and a button
    // reading "Following" tells somebody they are seeing posts they will not.
    expect(followStateOf({ follows: false, follow_request_status: "pending_sent" })).toBe(
      "requested"
    )
  })

  it("ignores a request pointed the other way", () => {
    // `pending_received` is THEM asking to follow US. It says nothing about
    // our edge toward them.
    expect(followStateOf({ follows: false, follow_request_status: "pending_received" })).toBe(
      "none"
    )
  })

  it("treats a following edge as settled even with a stale request flag", () => {
    expect(followStateOf({ follows: true, follow_request_status: "pending_sent" })).toBe(
      "following"
    )
  })

  it("reads an empty row as 'none'", () => {
    // A target absent from the map means "no relationship" rather than an
    // error — the map only carries what the store found.
    expect(followStateOf({})).toBe("none")
  })
})
