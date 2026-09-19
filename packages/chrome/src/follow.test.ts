/**
 * What the graph's answer means, as a table.
 *
 * ── Why this is worth a test at all ───────────────────────────────────────
 * Because three of the four values change what a real person is told about
 * their own relationship with another real person, and the fourth is the one
 * that must NOT be mistaken for success. `POST /v1/graph/follow` answers
 * `followed` OR `requested` — a private account turns a follow into a request
 * somebody has to accept — and a rail that renders "Following" on a
 * `requested` is telling someone they are seeing posts they will not see.
 *
 * The ONLY safe default is "unknown", because that is what the rail rolls back
 * on. A mapping that fell through to "followed" would paint a follow that may
 * never have happened.
 */

import { describe, expect, it } from "vitest"
import { followStatusOf } from "./api"

describe("followStatusOf", () => {
  it("keeps the three the service actually sends", () => {
    expect(followStatusOf("followed")).toBe("followed")
    expect(followStatusOf("unfollowed")).toBe("unfollowed")
    // The one it is easiest to collapse into "followed", and the one where
    // doing so misinforms.
    expect(followStatusOf("requested")).toBe("requested")
  })

  it("answers unknown for anything else, and never guesses success", () => {
    for (const value of [
      undefined,
      null,
      "",
      "ok",
      "true",
      true,
      1,
      {},
      "FOLLOWED", // case matters: the service sends lowercase
      "request_sent", // the CONNECTION route's word, not this one's
    ]) {
      expect(followStatusOf(value)).toBe("unknown")
    }
  })
})
