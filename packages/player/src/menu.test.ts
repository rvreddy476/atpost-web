import { describe, expect, it } from "vitest"
import { isOutsidePress, menuKeyAction, nextMenuIndex } from "./menu"

describe("nextMenuIndex", () => {
  it("moves down and up one row at a time", () => {
    expect(nextMenuIndex(0, 4, "ArrowDown")).toBe(1)
    expect(nextMenuIndex(2, 4, "ArrowUp")).toBe(1)
  })

  it("wraps, because a menu is a ring and the whole of it is visible", () => {
    expect(nextMenuIndex(3, 4, "ArrowDown")).toBe(0)
    expect(nextMenuIndex(0, 4, "ArrowUp")).toBe(3)
  })

  it("jumps to the ends, so eight speeds are one press apart", () => {
    expect(nextMenuIndex(3, 8, "Home")).toBe(0)
    expect(nextMenuIndex(3, 8, "End")).toBe(7)
  })

  it("starts from the first row when nothing is highlighted yet", () => {
    expect(nextMenuIndex(-1, 4, "ArrowDown")).toBe(1)
  })

  it("recovers from an index left over from a longer list", () => {
    expect(nextMenuIndex(9, 3, "ArrowDown")).toBe(1)
  })

  it("is null for a key that is not the menu's", () => {
    expect(nextMenuIndex(0, 4, "a")).toBeNull()
    expect(nextMenuIndex(0, 4, "Tab")).toBeNull()
  })

  it("answers -1 rather than throwing for a menu that re-rendered empty", () => {
    expect(nextMenuIndex(0, 0, "ArrowDown")).toBe(-1)
  })
})

describe("menuKeyAction", () => {
  it("closes on Escape", () => {
    expect(menuKeyAction("Escape", 4, 0)).toEqual({ kind: "close" })
  })

  it("closes on ArrowLeft, which is how the pattern leaves a submenu", () => {
    expect(menuKeyAction("ArrowLeft", 4, 0)).toEqual({ kind: "close" })
  })

  it("activates on Enter and on Space", () => {
    expect(menuKeyAction("Enter", 4, 1)).toEqual({ kind: "activate" })
    expect(menuKeyAction(" ", 4, 1)).toEqual({ kind: "activate" })
    expect(menuKeyAction("Spacebar", 4, 1)).toEqual({ kind: "activate" })
  })

  it("moves on the arrows and the ends", () => {
    expect(menuKeyAction("ArrowDown", 4, 0)).toEqual({ kind: "move", index: 1 })
    expect(menuKeyAction("End", 4, 0)).toEqual({ kind: "move", index: 3 })
  })

  it("never claims Tab — a menu inside a video may not be a focus trap", () => {
    expect(menuKeyAction("Tab", 4, 0)).toBeNull()
  })

  it("leaves the video's own keys alone while the menu is open", () => {
    // ArrowRight would seek. Inside an open menu it must reach nothing at all
    // rather than scrubbing the video out from under somebody reading a list.
    expect(menuKeyAction("ArrowRight", 4, 0)).toBeNull()
    expect(menuKeyAction("k", 4, 0)).toBeNull()
  })

  it("never claims a modified press", () => {
    expect(menuKeyAction("ArrowDown", 4, 0, { alt: true })).toBeNull()
    expect(menuKeyAction("Escape", 4, 0, { meta: true })).toBeNull()
  })
})

describe("isOutsidePress", () => {
  /** A Node, as much of one as this needs: identity and `contains`. */
  function node(children: object[] = []): Node {
    const self = {
      contains: (other: Node | null) => children.includes(other as unknown as object),
    }
    return self as unknown as Node
  }

  it("is false for a press inside the menu", () => {
    const item = node()
    const menu = node([item])
    expect(isOutsidePress(item, menu, null)).toBe(false)
  })

  it("is false for a press on the menu itself", () => {
    const menu = node()
    expect(isOutsidePress(menu, menu, null)).toBe(false)
  })

  it("is false for a press on the gear, so the button stays a toggle", () => {
    // Counting the trigger as an outside press closes the menu and the
    // button's own handler reopens it in the same gesture: it never closes.
    const trigger = node()
    expect(isOutsidePress(trigger, node(), trigger)).toBe(false)
  })

  it("is true for a press anywhere else, including on nothing", () => {
    expect(isOutsidePress(node(), node(), node())).toBe(true)
    expect(isOutsidePress(null, node(), node())).toBe(true)
  })
})
