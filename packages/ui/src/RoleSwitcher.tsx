"use client"

import { useCallback, useEffect, useId, useRef, useState } from "react"
import { ChevronDown, Smartphone } from "lucide-react"
import type { RoleDestination } from "@atpost/types/auth"
import { cn } from "./cn"

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SWITCHING NAVIGATES. IT DOES NOT REMEMBER.
 *
 * This control has no "current role". It stores nothing — not in localStorage,
 * not in a cookie, not in a context, not on the server. Choosing an entry is
 * exactly a link click, and the next sign-in behaves as if this menu had never
 * been touched.
 *
 * That is a decision, not an omission. Login always lands on /shop, so an
 * administrator arrives as a customer and walks to the console on purpose. A
 * remembered hat would quietly undo that: the second sign-in would drop them
 * straight into the admin console, and the whole point — that console access
 * is something you step into deliberately, and see the storefront the way a
 * customer does every time you sign in — would be gone, silently, for everyone
 * who ever clicked "Admin" once.
 *
 * So: do not add a `currentRole` prop. Do not persist the last choice. Do not
 * make this a <select> whose value is state. If a stateful role selector is
 * ever genuinely wanted, it is a different component with a different name,
 * and the founder decides that — it is not an improvement to this one.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Shape and styling notes:
 *
 * • Real anchors with absolute hrefs, never next/link. The destinations are in
 *   other Next zones behind their own basePath rewrites (/shop, /admin), so a
 *   client-side transition is not merely wrong here, it resolves the path
 *   against the wrong base. Anchors also keep middle-click and open-in-new-tab
 *   working, which a menu of "places" should.
 *
 * • Colours come from the shared `brand-*` tokens, so the one component reads
 *   correctly in both zones with no fork: in commerce those tokens resolve to
 *   the navy/gold shop palette, in admin to the light console palette. The
 *   accent chip is `bg-brand-accent text-brand-bg` — which is navy-on-gold in
 *   the shop (9.01:1), never white-on-gold (2.10:1, fails).
 *
 * • The menu stays mounted and is closed with the `hidden` attribute rather
 *   than unmounted. `hidden` takes it out of the accessibility tree, out of
 *   the focus order and out of find-in-page — the same result as unmounting —
 *   while keeping the markup stable and the whole control renderable, and
 *   therefore assertable, without a browser.
 */

export interface RoleSwitcherProps {
  /** Everything this person could reach, from `destinationsFor(...)`. */
  destinations: RoleDestination[]
  /** Label on the trigger. Defaults to "Switch". */
  label?: string
  /** Extra classes on the wrapper. */
  className?: string
  /** Accessible name for the trigger button. */
  "aria-label"?: string
}

/** A destination that cannot be opened here still gets a row; see below. */
function isActionable(destination: RoleDestination): boolean {
  return typeof destination.href === "string" && destination.href.length > 0
}

export function RoleSwitcher({
  destinations,
  label = "Switch",
  className,
  ...props
}: RoleSwitcherProps) {
  const baseId = useId()
  const buttonId = `${baseId}-trigger`
  const menuId = `${baseId}-menu`
  const appOnlyGroupId = `${baseId}-app-only`

  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLElement | null>>([])
  // -1 means "nothing focused yet"; set when the menu opens.
  const [activeIndex, setActiveIndex] = useState(-1)
  // Bumped on every request to move focus, including one that lands on the row
  // already active. Without it the focus effect keys off the index alone, and
  // "put focus back on the first row" is silently a no-op whenever the first
  // row is already the active one — which is exactly what happens when the
  // trigger is focused while the menu is open and ArrowDown is pressed.
  const [focusTick, setFocusTick] = useState(0)

  const focusItem = useCallback((index: number) => {
    setActiveIndex(index)
    setFocusTick((tick) => tick + 1)
  }, [])

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    setActiveIndex(-1)
    if (returnFocus) buttonRef.current?.focus()
  }, [])

  // Focus follows the active index, but only while open — moving focus into a
  // hidden subtree is what makes a menu trap a keyboard user.
  useEffect(() => {
    if (!open || activeIndex < 0) return
    itemRefs.current[activeIndex]?.focus()
  }, [open, activeIndex, focusTick])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("touchstart", onPointerDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("touchstart", onPointerDown)
    }
  }, [open, close])

  // One option is not a choice. Rendering nothing is the right answer for the
  // overwhelming majority of accounts, which hold no role at all.
  if (destinations.length < 2) return null

  const appOnlyCount = destinations.filter((d) => !isActionable(d)).length
  const lastIndex = destinations.length - 1

  const moveTo = (index: number) => {
    const wrapped = ((index % destinations.length) + destinations.length) % destinations.length
    focusItem(wrapped)
  }

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault()
        moveTo(activeIndex + 1)
        break
      case "ArrowUp":
        event.preventDefault()
        moveTo(activeIndex - 1)
        break
      case "Home":
        event.preventDefault()
        moveTo(0)
        break
      case "End":
        event.preventDefault()
        moveTo(lastIndex)
        break
      case "Escape":
        event.preventDefault()
        close(true)
        break
      case "Tab":
        // Let Tab do its normal thing, but do not leave a menu open behind it.
        close(false)
        break
      default:
        break
    }
  }

  const openAt = (index: number) => {
    setOpen(true)
    focusItem(index)
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        ref={buttonRef}
        type="button"
        id={buttonId}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={props["aria-label"] ?? "Switch between your atPost roles"}
        onClick={() => (open ? close(false) : openAt(0))}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault()
            openAt(0)
          } else if (event.key === "ArrowUp") {
            event.preventDefault()
            openAt(lastIndex)
          } else if (event.key === "Escape" && open) {
            event.preventDefault()
            close(true)
          }
        }}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-xl border border-brand-text/20 bg-brand-card/80 px-2.5 text-sm font-semibold text-brand-text",
          "transition-colors hover:border-brand-accent/70 hover:bg-brand-text/5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text/50",
        )}
      >
        {/* Gold in the shop, near-black in the console — and the glyph on it is
            always the page ground colour, so it is navy on gold, never white. */}
        <span
          aria-hidden="true"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-brand-accent text-[11px] font-bold text-brand-bg"
        >
          {destinations.length}
        </span>
        <span className="hidden sm:inline">{label}</span>
        <ChevronDown
          aria-hidden="true"
          className={cn("h-4 w-4 shrink-0 text-brand-text/50 transition-transform", open && "rotate-180")}
        />
      </button>

      {/* The panel is the popup; the menu is only the rows inside it. A
          `role="menu"` may contain menuitems, groups and separators and
          nothing else, so the heading and the footnote sit beside it rather
          than in it — they are still visually part of the dropdown, and still
          reachable by IDREF from the rows that need them. */}
      <div
        hidden={!open}
        onKeyDown={onMenuKeyDown}
        className={cn(
          "absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-brand-text/15",
          "bg-brand-card p-1 shadow-xl shadow-black/20",
        )}
      >
        <p className="px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[.14em] text-brand-text/50">
          Go to
        </p>

        <div id={menuId} role="menu" aria-labelledby={buttonId}>
          {destinations.map((destination, index) => {
            const ref = (node: HTMLElement | null) => {
              itemRefs.current[index] = node
            }

            if (isActionable(destination)) {
              return (
                <a
                  key={destination.id}
                  ref={ref as React.Ref<HTMLAnchorElement>}
                  role="menuitem"
                  tabIndex={index === activeIndex ? 0 : -1}
                  href={destination.href as string}
                  onClick={() => close(false)}
                  className={cn(
                    "flex w-full flex-col rounded-lg px-3 py-2 text-left transition-colors",
                    "hover:bg-brand-text/5 focus-visible:bg-brand-text/5 focus-visible:outline-none",
                  )}
                >
                  <span className="text-sm font-semibold text-brand-text">{destination.label}</span>
                  <span className="text-xs text-brand-text/60">{destination.description}</span>
                </a>
              )
            }

            /*
             * A hat the web cannot wear.
             *
             * Dropping these silently was the tempting option and the wrong one:
             * a delivery partner who sees no sign of their status anywhere on the
             * site does not conclude "this is a phone feature", they conclude the
             * platform has lost their approval — and then they contact support
             * about an account that is perfectly fine.
             *
             * So the row is present, named, and honestly unusable: `aria-disabled`
             * rather than removed from the menu, so it is still reachable with the
             * arrow keys and a screen-reader user is told the same thing a sighted
             * one can see. `aria-disabled` and not the `disabled` attribute
             * precisely because `disabled` would make it unreachable, and an
             * announcement nobody can reach is the silent drop again.
             */
            return (
              <div
                key={destination.id}
                ref={ref as React.Ref<HTMLDivElement>}
                role="menuitem"
                aria-disabled="true"
                tabIndex={index === activeIndex ? 0 : -1}
                aria-describedby={appOnlyGroupId}
                className="flex w-full cursor-default flex-col rounded-lg px-3 py-2 focus-visible:bg-brand-text/5 focus-visible:outline-none"
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-brand-text/55">
                  <Smartphone aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                  {destination.label}
                </span>
                <span className="text-xs text-brand-text/45">{destination.unavailableReason}</span>
              </div>
            )
          })}
        </div>

        {appOnlyCount > 0 && (
          <p
            id={appOnlyGroupId}
            className="border-t border-brand-text/10 px-3 pb-2 pt-2 text-xs text-brand-text/50"
          >
            {appOnlyCount === 1
              ? "You still hold that role — it is managed in the atPost app, not on the web."
              : "You still hold those roles — they are managed in the atPost app, not on the web."}
          </p>
        )}
      </div>
    </div>
  )
}
