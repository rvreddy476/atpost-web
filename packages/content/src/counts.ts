/**
 * A count, compacted the way the Android design system compacts one.
 *
 * ── Why this is in a package rather than in a zone ────────────────────────
 * It was written in `apps/reels/src/reels/rail.ts`, correctly, because reels
 * was the only surface that had counts to draw. Tube is the second, and the
 * rule this repository states in `@momentum/chrome`'s index — "a shared
 * abstraction with one caller is a guess; with two it is a fact" — is the
 * reason it moved here instead of being copied.
 *
 * It matters more than a formatter usually would. The number under a heart is
 * the same number on a reel, on a long video, on a profile grid and in a
 * search result, and two implementations of "1.2K" drift in exactly one way:
 * one of them rounds. "1.2K" from `Math.round` is 1150–1249 and from
 * `Math.floor` is 1200–1299, so the same post shows two different figures on
 * two surfaces of the same product and neither is wrong on its own.
 *
 * The rule, from the phone: thousands to one decimal, and never a trailing
 * ".0" — "1.2K" says something and "1.0K" is just a longer "1K".
 *
 * `apps/reels/src/reels/rail.ts` re-exports this so that nothing in that zone
 * had to move with it, and `railCountLabel` — which is about a CONTROL naming
 * itself when the count is zero — stayed there, because that is a rail's rule
 * and not a number's.
 */

/** "999", "1.2K", "12K", "1.4M". Never "1.0K", and never a negative. */
export function formatCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0"
  const n = Math.floor(count)
  if (n < 1_000) return String(n)
  if (n < 1_000_000) return `${trim(n / 1_000)}K`
  return `${trim(n / 1_000_000)}M`
}

function trim(value: number): string {
  // One decimal, but only when it says something. Floor rather than round, so
  // a compacted number never claims more than the real one.
  const one = Math.floor(value * 10) / 10
  return Number.isInteger(one) ? String(one) : one.toFixed(1)
}
