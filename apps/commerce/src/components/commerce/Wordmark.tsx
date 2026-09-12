import { BRAND } from "@momentum/brand"

/**
 * The lockup for one of the two commerce apps: a stylised capital in ember,
 * then the rest of the word. "MStore" for the buyer side, "MSeller" for the
 * seller side, exactly as the phone draws them.
 *
 * ONE component, reading ONE constant each, so a rename is a line in
 * @momentum/brand and not a search through the zone. The split into mark and
 * word is done here from the string rather than stored as two fields, so the
 * two halves cannot drift apart.
 *
 * The mark is a 1.35em / 800 glyph on the ember gradient, which is a non-text
 * mark by size and weight and clears the 3.0 bar ember carries; the word
 * beside it is ink, because ember at body sizes does not. Screen readers get
 * the whole name once, from the visually hidden span, and never the two
 * halves separately.
 */
export function Wordmark({ app = "store", className }: { app?: "store" | "seller"; className?: string }) {
  const name = app === "store" ? BRAND.store : BRAND.sellerApp
  return (
    <span className={["app-wordmark", className].filter(Boolean).join(" ")}>
      <span className="sr-only">{name}</span>
      <b aria-hidden="true">{name.charAt(0)}</b>
      <span aria-hidden="true">{name.slice(1)}</span>
    </span>
  )
}
