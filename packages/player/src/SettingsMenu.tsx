"use client"

/**
 * The gear's menu — a presentational surface, driven entirely by props.
 *
 * It holds no state of its own. `MomentumVideo` owns which page is open, which
 * row is highlighted, and what a press means; this draws what it is told and
 * reports presses back. That split is what lets the interesting half — the
 * roving index, the key map, the outside-press rule — live in ./menu.ts as
 * pure functions with tests, instead of inside a component nothing in this
 * repo can render (there is no jsdom here and there is not going to be one).
 *
 * ── The ARIA shape, and the one decision inside it ────────────────────────
 * `role="menu"` with a ROVING TABSTOP: the menu is one tab stop, exactly one
 * row carries `tabIndex={0}`, and the arrows move it. The alternative puts
 * eight speeds into the page's tab order, which on a video player is a
 * shortcut that costs more presses than the thing it shortcuts.
 *
 * A sub-page's rows are `menuitemradio` and not `menuitem`, because they are a
 * single-choice group and `aria-checked` is the only way a screen reader is
 * told which speed is running. The root's rows are `menuitem` with
 * `aria-haspopup`, and each carries its current VALUE in the label — "Speed,
 * Normal" — so the state is available without opening anything.
 *
 * ── Colour ───────────────────────────────────────────────────────────────
 * Every surface here is a token. This floats over user photography, so the
 * ground is `--mo-bg` at .92 rather than `--mo-overlay`: the menu has to be
 * legible over a white sky as well as over a night shot, and a themed panel
 * with no ground behind it disappears into half the videos on the platform.
 */

import { CheckGlyph, ChevronLeftGlyph } from "./icons"

/** One row. `value` is the right-hand summary the root page shows. */
export interface MenuRow {
  id: string
  label: string
  /** The current setting, shown on a root row. Absent on a leaf. */
  value?: string
  /** A leaf row's selected state. Absent on a root row. */
  checked?: boolean
}

export interface SettingsMenuProps {
  /** The submenu's name, or null for the root page. */
  title: string | null
  rows: readonly MenuRow[]
  /** Which row has the roving tabstop. -1 before the keyboard has been used. */
  activeIndex: number
  onActivate: (index: number) => void
  /** Moves the highlight on hover, so the pointer and the keyboard agree. */
  onHover: (index: number) => void
  onBack: () => void
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void
  menuRef: React.Ref<HTMLDivElement>
  /** Set on the row that should hold focus, so the caller can move it there. */
  rowRef: (index: number) => (el: HTMLButtonElement | null) => void
  /** Ties the menu back to the gear for assistive technology. */
  labelledBy: string
}

/** A row's minimum box. 40px, which is the smallest a finger reliably hits. */
const ROW = "flex h-10 w-full items-center gap-2 rounded-mo-sm px-2.5 text-left text-xs"

export function SettingsMenu({
  title,
  rows,
  activeIndex,
  onActivate,
  onHover,
  onBack,
  onKeyDown,
  menuRef,
  rowRef,
  labelledBy,
}: SettingsMenuProps) {
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      className={[
        // Anchored above the transport rather than over the middle of the
        // picture: a menu that covers the frame is a menu you close to see
        // what you were changing.
        "absolute bottom-14 right-2 z-20 w-48 overflow-hidden rounded-mo",
        "bg-mo-bg/92 p-1 text-mo-ink shadow-mo backdrop-blur-sm",
        "max-h-[min(18rem,60%)] overflow-y-auto",
      ].join(" ")}
    >
      {title && (
        <button
          type="button"
          onClick={onBack}
          className={`${ROW} font-semibold text-mo-ink hover:bg-mo-ink/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-mo`}
        >
          <ChevronLeftGlyph className="h-4 w-4 shrink-0" />
          {title}
        </button>
      )}
      {rows.map((row, index) => {
        const leaf = typeof row.checked === "boolean"
        return (
          <button
            key={row.id}
            ref={rowRef(index)}
            type="button"
            role={leaf ? "menuitemradio" : "menuitem"}
            aria-checked={leaf ? row.checked : undefined}
            aria-haspopup={leaf ? undefined : true}
            // The roving tabstop. Exactly one row is reachable with Tab; the
            // arrows move which one, which is the whole of the menu pattern.
            tabIndex={index === activeIndex || (activeIndex < 0 && index === 0) ? 0 : -1}
            onClick={() => onActivate(index)}
            onPointerEnter={() => onHover(index)}
            className={[
              ROW,
              "text-mo-ink transition-colors duration-150 ease-mo motion-reduce:transition-none",
              "hover:bg-mo-ink/15",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-mo",
              index === activeIndex ? "bg-mo-ink/15" : "",
            ].join(" ")}
          >
            {leaf && (
              <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
                {row.checked && <CheckGlyph className="h-4 w-4" />}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            {row.value && (
              <span className="shrink-0 text-[11px] text-mo-body">{row.value}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
