/**
 * The transport glyphs, drawn rather than imported.
 *
 * These are Lucide's own `play`, `pause`, `volume-2`, `volume-x`, `settings`,
 * `captions`, `maximize`, `minimize`, `picture-in-picture-2`, `check` and
 * `chevron-left` — the same icons `@momentum/content` and the Android client
 * use, on the same 24×24 grid with the same 2px round-joined stroke —
 * transcribed here instead of pulled from `lucide-react`.
 *
 * ── Why not just add the dependency ──────────────────────────────────────
 * @momentum/player has no `lucide-react` in its package.json, and adding one
 * rewrites the lockfile, which is checked with `bun install --frozen-lockfile`
 * in CI. A dozen path strings is a smaller price than a lockfile change, and it
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

/** lucide `settings` — the gear that hosts speed, quality and captions. */
export function SettingsGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </Glyph>
  )
}

/** lucide `captions` — CC. Drawn, not typed: "CC" set in a button is two
 *  letters at whatever the surrounding font happens to be, and it fails to
 *  read as an icon at 16px next to three glyphs that are icons. */
export function CaptionsGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <rect width="18" height="14" x="3" y="5" rx="2" ry="2" />
      <path d="M7 15h4M15 15h2M7 11h2M13 11h4" />
    </Glyph>
  )
}

/** lucide `maximize` — enter full screen. */
export function MaximizeGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M8 3H5a2 2 0 0 0-2 2v3" />
      <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
      <path d="M3 16v3a2 2 0 0 0 2 2h3" />
      <path d="M16 21h3a2 2 0 0 0 2-2v-3" />
    </Glyph>
  )
}

/** lucide `minimize` — leave full screen. */
export function MinimizeGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M8 3v3a2 2 0 0 1-2 2H3" />
      <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
      <path d="M3 16h3a2 2 0 0 1 2 2v3" />
      <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
    </Glyph>
  )
}

/** lucide `picture-in-picture-2`. */
export function PictureInPictureGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M21 9V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h4" />
      <rect width="10" height="7" x="12" y="13" rx="2" />
    </Glyph>
  )
}

/** lucide `check` — the chosen row of a menu. */
export function CheckGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Glyph>
  )
}

/** lucide `chevron-left` — back, out of a submenu. */
export function ChevronLeftGlyph({ className }: GlyphProps) {
  return (
    <Glyph className={className}>
      <path d="m15 18-6-6 6-6" />
    </Glyph>
  )
}
