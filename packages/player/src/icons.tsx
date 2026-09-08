/**
 * The four transport glyphs, drawn rather than imported.
 *
 * These are Lucide's own `play`, `pause`, `volume-2` and `volume-x` — the same
 * icons `@momentum/content` and the Android client use, on the same 24×24 grid
 * with the same 2px round-joined stroke — transcribed here instead of pulled
 * from `lucide-react`.
 *
 * ── Why not just add the dependency ──────────────────────────────────────
 * @momentum/player has no `lucide-react` in its package.json, and adding one
 * rewrites the lockfile, which is checked with `bun install --frozen-lockfile`
 * in CI. Four path strings is a smaller price than a lockfile change, and it
 * keeps the package's real promise intact: the player has exactly one runtime
 * dependency (hls.js, loaded dynamically) so that tube, a profile grid or a
 * test can mount it without inheriting an icon set.
 *
 * The glyphs are not invented and must not be. If one of these ever looks
 * wrong, the fix is to re-copy the `d` from Lucide, never to redraw it.
 */

interface GlyphProps {
  className?: string
}

/** The shared skeleton: Lucide's viewBox, stroke and joins, nothing else. */
function Glyph({ className, children }: GlyphProps & { children: React.ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {children}
    </svg>
  )
}

/** lucide `play`. Filled as well as stroked — a hollow play reads as an outline
 *  button over busy photography, and this one sits on a scrim over a picture. */
export function PlayGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <polygon points="6 3 20 12 6 21 6 3" fill="currentColor" />
    </Glyph>
  )
}

/** lucide `pause`. */
export function PauseGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" />
      <rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" />
    </Glyph>
  )
}

/** lucide `volume-2` — sound is on. */
export function Volume2Glyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      <path d="M16 9a5 5 0 0 1 0 6" />
      <path d="M19.364 18.364a9 9 0 0 0 0-12.728" />
    </Glyph>
  )
}

/** lucide `volume-x` — sound is off. */
export function VolumeXGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z" />
      <line x1="22" x2="16" y1="9" y2="15" />
      <line x1="16" x2="22" y1="9" y2="15" />
    </Glyph>
  )
}
