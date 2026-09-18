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
 * ── Colour: this menu is ON THE SCRIM, like everything else in the player ─
 * Every surface here is a token, and the tokens are the media ones. The menu
 * floats over user photography, so it needs a ground that does not follow the
 * page — it has to be legible over a white sky as well as over a night shot.
 *
 * It used to say that in the comment and then paint `--mo-bg` at .92 with
 * `--mo-ink` on it, which is the THEME's ground and the THEME's type. That
 * works only as long as every zone is dark. Under `.mo-light` the veil becomes
 * white at .92 — over a white frame, literally the frame — and the ink becomes
 * the near-black #0F1A14, so the menu stops being a panel at all and its rows
 * become dark words floating on the video. `--mo-scrim` is the token whose
 * whole job is a veil that stays dark in both scopes, and `--mo-on-scrim` is
 * the only type that goes on one. The gradient under the transport, the
 * carousel's counter pill and the seek tooltip are all already on that pair;
 * this is the last surface in the player that was not.
 *
 * Measured the way tokens.css measures every scrim, against the worst ground
 * a veil can have — pure white media. `--mo-on-scrim` on `--mo-scrim` at .92
 * is 14.94 over white, 16.42 over mid grey and 17.56 over black, AAA
 * throughout; the value column's `--mo-on-scrim-body` is 9.73 over white.
 *
 * On the tokens alone the dark zones would not move to speak of: the veil goes
 * from #0D0C14 at .92 to #08070E at .92, five parts in 255 on a surface that is
 * 92% opaque, and the ink is #F1EEF8 either way — the same value `--mo-ink`
 * already had there. They DO move, though, and for a separate reason recorded
 * on the class itself: the old alpha never compiled, so there was no veil in
 * any zone. The dark menu gains the ground it was always described as having.
 *
 * The hover and active fills follow the ink rather than the theme for the same
 * reason: `bg-mo-ink/15` over this veil is a near-black wash in a light zone,
 * where it is meant to be a lift.
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

/**
 * A row's box. 44px.
 *
 * It was 40, under a note calling that "the smallest a finger reliably hits" —
 * the same sentence, and the same wrong number, that stood over
 * `TRANSPORT_BUTTON` in ./MomentumVideo. The brief names 44 and the rest of
 * the product is built to it. These rows were found at 40 by opening the gear
 * at 360px, where the menu is 192px wide and every row in it is a target a
 * thumb has to land on without catching the one above.
 *
 * Height only: the type stays `text-xs` and the gutters stay `px-2.5`, so it
 * is the same menu with 4px more air a row. At 360 it still ends 24px inside
 * the frame, which a change in height does not touch.
 */
const ROW = "flex h-11 w-full items-center gap-2 rounded-mo-sm px-2.5 text-left text-xs"

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
        // `/[0.92]` and not `/92`, and that is not a style preference. 92 is
        // not a step in Tailwind's opacity scale — it runs in fives — so
        // `bg-mo-bg/92`, which is what stood here, matched no utility and
        // emitted NO CSS. The menu has had no ground at all: rows of type
        // floating directly on the video, which over a bright frame is the
        // exact failure this comment has always claimed to prevent. The
        // bracketed form is the arbitrary-value syntax and compiles to
        // `rgb(var(--mo-scrim) / 0.92)`. Checked against the whole repo: this
        // was its only out-of-scale alpha, and the test in @momentum/tokens
        // now keeps it that way.
        "bg-mo-scrim/[0.92] p-1 text-mo-on-scrim shadow-mo backdrop-blur-sm",
        "max-h-[min(18rem,60%)] overflow-y-auto",
      ].join(" ")}
    >
      {title && (
        <button
          type="button"
          onClick={onBack}
          className={`${ROW} font-semibold text-mo-on-scrim hover:bg-mo-on-scrim/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-mo`}
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
              "text-mo-on-scrim transition-colors duration-150 ease-mo motion-reduce:transition-none",
              "hover:bg-mo-on-scrim/15",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-mo",
              index === activeIndex ? "bg-mo-on-scrim/15" : "",
            ].join(" ")}
          >
            {leaf && (
              <span aria-hidden="true" className="flex h-4 w-4 shrink-0 items-center justify-center">
                {row.checked && <CheckGlyph className="h-4 w-4" />}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{row.label}</span>
            {row.value && (
              <span className="shrink-0 text-[11px] text-mo-on-scrim-body">{row.value}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
