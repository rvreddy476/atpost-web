import { describe, expect, it } from "vitest"
import { unwrapMe } from "./session"

/**
 * `GET /v1/auth/me` is what replaced reading a user id out of a token, so the
 * shape it comes back in is load-bearing: get it wrong and the app believes
 * nobody is signed in while holding a perfectly good session.
 *
 * The real response, observed against the local stack through the gateway:
 *
 *   { "data": { "id": "…", "user_id": "…", "email": "…", "roles": [], … } }
 */
describe("unwrapMe", () => {
  it("reads the house envelope", () => {
    const me = unwrapMe({
      data: {
        id: "7bffa601-83b4-49c8-b6c1-3b5cbde3e3fc",
        user_id: "7bffa601-83b4-49c8-b6c1-3b5cbde3e3fc",
        email: "someone@example.com",
        email_verified: true,
        roles: [],
      },
    })

    expect(me?.id).toBe("7bffa601-83b4-49c8-b6c1-3b5cbde3e3fc")
    expect(me?.email).toBe("someone@example.com")
    expect(me?.roles).toEqual([])
  })

  it("reads a bare body too, rather than pick one and be wrong on a gateway change", () => {
    const me = unwrapMe({ id: "u-1", email: "bare@example.com" })
    expect(me?.id).toBe("u-1")
  })

  it("falls back to user_id when only that is present", () => {
    const me = unwrapMe({ data: { user_id: "u-2", email: "x@example.com" } })
    expect(me?.id).toBe("u-2")
  })

  it("returns null for a body with no id, instead of a user object with no user", () => {
    // Half an identity is worse than none: it would put the app in a
    // signed-in shape with nobody in it.
    expect(unwrapMe({ data: { email: "nobody@example.com" } })).toBeNull()
    expect(unwrapMe({ data: { id: "" } })).toBeNull()
    expect(unwrapMe({})).toBeNull()
    expect(unwrapMe(null)).toBeNull()
    expect(unwrapMe("not an object")).toBeNull()
  })

  it("keeps the roles identity resolves live, which is the reason to ask at all", () => {
    const me = unwrapMe({ data: { id: "u-3", email: "a@b.c", roles: ["seller", "moderator"] } })
    expect(me?.roles).toEqual(["seller", "moderator"])
  })
})
