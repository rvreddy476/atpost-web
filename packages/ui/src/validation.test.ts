import { describe, it, expect } from "vitest"
import { validateEmail, validateRequired } from "./validation"

describe("validateEmail", () => {
  it("accepts valid addresses", () => {
    for (const ok of ["a@b.co", "user.name+tag@sub.example.com", "  trimmed@x.io  "]) {
      expect(validateEmail(ok)).toBeNull()
    }
  })
  it("rejects invalid addresses", () => {
    for (const bad of ["", "  ", "no-at", "a@b", "a@@b.com", "a b@c.com", "a@b .com"]) {
      expect(validateEmail(bad)).not.toBeNull()
    }
  })
  it("rejects over-long addresses", () => {
    expect(validateEmail("x".repeat(250) + "@y.com")).not.toBeNull()
  })
})

describe("validateRequired", () => {
  it("flags empty, passes non-empty", () => {
    expect(validateRequired("")).not.toBeNull()
    expect(validateRequired("   ")).not.toBeNull()
    expect(validateRequired("hi")).toBeNull()
  })
})
