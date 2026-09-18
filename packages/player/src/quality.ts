/**
 * Quality, which is a list of heights and one word.
 *
 * hls.js reports its levels after `MANIFEST_PARSED`, and `hls.currentLevel`
 * takes an index into that list — with `-1` meaning "you choose". Everything
 * here is the translation between that array and something a person can read,
 * kept pure so the interesting cases (a level with no height, two levels at
 * the same height, a remembered height the new video does not have) can be
 * asserted without a manifest.
 *
 * ── Auto is the default and stays the default ─────────────────────────────
 * A remembered EXPLICIT choice is restored; the absence of one is Auto, not
 * "the highest we saw last time". An adaptive player that starts at 1080p on
 * a phone on a train is a player that buffers, and the person who picked
 * 1080p once on a desktop did not ask for that.
 *
 * ── Auto shows what it resolved to ────────────────────────────────────────
 * "Auto" alone is the commonest complaint about an adaptive player: it gives
 * no way to tell a deliberate 360p from a broken one. So the menu row says
 * `Auto (720p)` while playing, from `hls.currentLevel` — the level actually
 * loading, which is not the same as `hls.loadLevel` when a switch is in
 * flight.
 *
 * ── Where the menu is ABSENT ──────────────────────────────────────────────
 * Native HLS on iOS Safari and a progressive MP4 have no level list at all —
 * the browser is doing the adapting and there is nothing to set. `MomentumVideo`
 * passes an empty list there and `qualityMenuAvailable` is false, so the row
 * is not drawn. It is not a disabled control and not an empty menu: there is
 * genuinely no choice to offer, and pretending otherwise is worse than
 * silence.
 */

import { readPreference, writePreference, clearPreference } from "./preferences"

const STORAGE_NAME = "quality"

/** The shape this file needs from an hls.js `Level`. Nothing more. */
export interface LevelLike {
  height?: number
  width?: number
  bitrate?: number
}

/** One row of the quality menu. `index` is what `hls.currentLevel` takes. */
export interface QualityOption {
  /** The hls.js level index, or -1 for Auto. */
  index: number
  label: string
  /** The resolved height, for remembering a choice across videos. 0 = Auto. */
  height: number
}

/** `-1` is hls.js's own value for "adapt". Named so nobody has to remember. */
export const AUTO_LEVEL = -1

/**
 * What one level is called.
 *
 * Height, because that is the number people have — nobody has ever asked for
 * 2.8 Mbps. A level with no usable height falls back to its bitrate, which is
 * rare but real: some packagers omit RESOLUTION from a variant, and a menu row
 * reading `0p` is worse than one reading `1.4 Mbps`. A level with neither gets
 * its position, so the row is at least distinguishable from its neighbours.
 */
export function levelLabel(level: LevelLike, index: number): string {
  const height = Math.round(level.height ?? 0)
  if (height > 0) return `${height}p`
  const bitrate = level.bitrate ?? 0
  if (bitrate > 0) return `${Math.round(bitrate / 1000)} kbps`
  return `Level ${index + 1}`
}

/**
 * The menu, highest first, with Auto at the top.
 *
 * Descending, which is the order every player uses and the opposite of the
 * order hls.js reports: a manifest is authored lowest-first, and a menu that
 * put 144p at the top would make the row people want the one furthest from
 * the button they just pressed.
 *
 * Duplicate heights are collapsed. A ladder can carry two 720p variants at
 * different bitrates, and two identical rows is a menu where pressing either
 * one looks like it did nothing. The FIRST at a height wins, which after the
 * descending sort is the higher-bitrate one — the better picture, which is
 * what somebody choosing a height by hand is asking for.
 */
export function qualityOptions(levels: readonly LevelLike[]): QualityOption[] {
  const rows: QualityOption[] = levels.map((level, index) => ({
    index,
    label: levelLabel(level, index),
    height: Math.round(level.height ?? 0),
  }))
  rows.sort((a, b) => b.height - a.height || (b.index - a.index))
  const seen = new Set<number>()
  const unique: QualityOption[] = []
  for (const row of rows) {
    // Height 0 rows are bitrate- or position-labelled and are never duplicates
    // of each other in any useful sense, so they all survive.
    if (row.height > 0) {
      if (seen.has(row.height)) continue
      seen.add(row.height)
    }
    unique.push(row)
  }
  return [{ index: AUTO_LEVEL, label: "Auto", height: 0 }, ...unique]
}

/** Is there anything to choose between? One variant is not a choice. */
export function qualityMenuAvailable(levels: readonly LevelLike[]): boolean {
  return levels.length > 1
}

/**
 * What the Auto row says while Auto is on.
 *
 * `Auto (720p)` when a level is resolved, plain `Auto` before the first
 * fragment has picked one. `hls.currentLevel` is -1 until then, and
 * `Auto (0p)` on a poster would be the player reporting a resolution it has
 * not got.
 */
export function autoLabel(levels: readonly LevelLike[], currentIndex: number): string {
  const level = currentIndex >= 0 ? levels[currentIndex] : undefined
  const height = Math.round(level?.height ?? 0)
  return height > 0 ? `Auto (${height}p)` : "Auto"
}

/**
 * The label for the gear's "Quality" row — what is in force right now.
 *
 * This is the one a person reads without opening the submenu, so it has to be
 * true in both modes: the resolved height while adapting, the chosen height
 * when chosen.
 */
export function currentQualityLabel(
  levels: readonly LevelLike[],
  selectedIndex: number,
  currentIndex: number
): string {
  if (selectedIndex === AUTO_LEVEL) return autoLabel(levels, currentIndex)
  const level = levels[selectedIndex]
  return level ? levelLabel(level, selectedIndex) : autoLabel(levels, currentIndex)
}

/**
 * The level to use for a remembered HEIGHT, on a ladder that may not have it.
 *
 * A height is remembered rather than an index because an index means nothing
 * across videos: level 2 is 480p on one ladder and 1080p on the next, so
 * restoring an index would hand somebody a different quality on every video
 * they opened. A height is the thing they actually chose.
 *
 * When the exact height is gone, the NEAREST is used, and a tie goes to the
 * LOWER one. Somebody who asked for 720p on a video that only has 480p and
 * 1080p is better served by the one that will not stall — the cost of
 * guessing up is a buffer wheel, the cost of guessing down is a slightly
 * softer picture.
 *
 * `AUTO_LEVEL` for no memory at all, and for an empty ladder.
 */
export function nearestLevelForHeight(levels: readonly LevelLike[], height: number): number {
  if (!Number.isFinite(height) || height <= 0) return AUTO_LEVEL
  let best = AUTO_LEVEL
  let bestHeight = 0
  let bestDistance = Number.POSITIVE_INFINITY
  levels.forEach((level, index) => {
    const candidate = Math.round(level.height ?? 0)
    if (candidate <= 0) return
    const distance = Math.abs(candidate - height)
    if (distance < bestDistance || (distance === bestDistance && candidate < bestHeight)) {
      best = index
      bestHeight = candidate
      bestDistance = distance
    }
  })
  return best
}

/** What a stored string means. `"auto"`, absent, or junk all mean Auto. */
export function parseQualityHeight(raw: string | null | undefined): number {
  if (raw == null || raw === "" || raw === "auto") return 0
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}

/** This viewer's remembered height. 0 means Auto. */
export function readQualityHeight(viewerId: string | null | undefined): number {
  return parseQualityHeight(readPreference(STORAGE_NAME, viewerId))
}

/**
 * Remember a choice, or forget one.
 *
 * Picking Auto REMOVES the key rather than storing `"auto"`. The two would
 * behave identically today, and the difference matters the day this list
 * grows a third state: an absent key is unambiguously "never chose", which is
 * the only thing a future default may safely act on.
 */
export function writeQualityHeight(viewerId: string | null | undefined, height: number): void {
  if (!Number.isFinite(height) || height <= 0) {
    clearPreference(STORAGE_NAME, viewerId)
    return
  }
  writePreference(STORAGE_NAME, viewerId, String(Math.round(height)))
}
